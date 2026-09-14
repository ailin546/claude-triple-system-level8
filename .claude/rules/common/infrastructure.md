# Hooks, Drift Detection & Performance

> 合并自 `hooks.md`、`drift-detection.md`、`performance.md`。
> 三者同属"infrastructure/harness 行为"，合并后降低加载开销。

## Hooks System (Layered)

### 分层架构

Hooks 按模式分层，Fast 模式仅运行 Always-on hooks，减少开销。
Standard+/Heavy hooks 内置模式检查（`lib/mode-check.js`），Fast 模式下自动跳过。

所有 hook 计算 project root 时统一调用 `lib/project-root.js:getProjectRoot()` (或 `lib/utils.js:getProjectRoot()` 套了 git 探测的版本)。该函数有两个守卫：① cwd 落在 `~/.claude/` 内 → 折返到 HOME；② cwd 落在任何 `.memory/` 内 → walk-up 到第一个非 `.memory` 祖先。守卫之二（2026-05-03 加）防止 hook 在 `.memory/` 自身 git repo 内启动时把它当 project root，避免 `.memory/.memory/` 嵌套副本和运行时状态污染 memory repo。

#### Hook 输出渠道 SSOT（2026-06-29 实测确诊）

> 实现：`lib/hook-output.js::emitAdditionalContext(text, hookEventName='PostToolUse')`。
> 实测方法：临时探针 hook + 正对照，在 `/Users/llm/project` 真实环境验证（settings.local.json 注册 → 触发 → 看标记串是否进模型上下文）。

**Claude Code hook 输出渠道真值表**——决定一段文本能否被**模型**看到：

| Hook 事件 | exit-0 stdout（plain） | exit-0 stderr | exit-2 stderr | exit-0 stdout 的 `hookSpecificOutput.additionalContext` JSON |
|---|---|---|---|---|
| SessionStart / UserPromptSubmit | ✅ 进上下文 | ❌ 终端 | 终端/阻断 | ✅（也可，但这两类直接 stdout 已够）|
| **PreToolUse / PostToolUse** | ❌ 只进 transcript | ❌ 只进终端 | ✅ 进上下文（标 blocking error）| ✅ 进上下文（**非阻塞**，以 system-reminder 注入）|

**给 PostToolUse / PreToolUse hook 注入"给模型看的提醒"的唯一正确渠道 = `emitAdditionalContext`**（exit 0 + stdout 输出 JSON envelope）。exit-2 也能到模型但会把工具标成 error，对温和 nudge 太重，仅 careful-guard 这类**阻断**场景用。

**硬契约**：调用 `emitAdditionalContext` 的 hook **禁止**再往 stdout 写任何其他字节（旧的 stdin passthrough 必须删除）——多余字节会让合并后的 stdout 变成非法 JSON，additionalContext 被静默丢弃。

**历史坑**：lesson-nudge / fault-hint / drift-detector 此前用 stderr(或 `log()`)+exit0「提醒 Claude」，但按上表模型根本看不到 → 提醒全部石沉大海（也是项目 long-term memory 2026-04-27 后停止增长的一环：lesson-nudge 沉淀链实际断开）。2026-06-29 三者统一切到 `emitAdditionalContext`。单测：`__tests__/hook-output.test.js`（5 用例）。

#### Always-on（所有模式）

| Hook | 类型 | 用途 |
|------|------|------|
| session-start | SessionStart | 加载上次会话上下文、检测包管理器 |
| task-router | SessionStart | 重置模式为 fast、清空 escalation-state、截断 trace 日志 |
| rules-loader | SessionStart | 检测项目语言，动态加载 rules-all/ 中对应语言规则 |
| careful-guard | PreToolUse(Bash) | 破坏性命令守卫 v2：DENY（fork bomb / mkfs / dd / `rm -rf /`）无条件拦；CONTEXTUAL 按上下文判（clean tree 的 `reset --hard origin/<br>` 放行；`rm -rf` 按每个操作数判定，全部为 build 工件或 `/tmp/` 之下才放行）；force-push 只在 push 自身 segment 内且 redirect-aware；单条 git/cargo/npm/脚本命令走 allowlist。状态 `~/.claude/.careful-enabled`。单测 50 用例。历史修复见 on-demand/lesson-archive.md |
| freeze-guard | PreToolUse(Edit\|Write) | 编辑范围冻结守卫（/freeze 机制） |
| pre-tool-escalate | PreToolUse(Bash\|Edit\|Write) | 风险信号升档 + 跨文件累积（3 文件 → Standard，6 → Heavy）+ 5 分钟空闲任务边界重置。Bash 按 segment + strip quotes 匹配（`lib/command-scan.js`），git VCS 操作不升档，关键词边界 hyphen-aware（`quant-deploy` 路径不误升），纯文档路径既不计数也不触发目录名信号。单测 41 用例。历史修复见 on-demand/lesson-archive.md（2026-06-06 / 06-13 / 07-16 / 07-17） |
| **fix-depth-check** | PreToolUse(Bash) | git commit 含 fix 关键字但缺根因解释 → 软警告（不阻塞）。提示补"root cause:"/"because"/"原因"/"根因" |
| **user-prompt-classify** | UserPromptSubmit | 检测 fix/bug/事故关键词 → fast 自动升 standard；session 首条 prompt 注入"深度评估"提示（要求显式 symptom/behavior/root-cause 分级）；**2026-05-21 扩展**：检测 spec/M-X/Wave/Phase/实施 引用 → inject `[Scope-Reflection Required]` 4 问反思（偶发？已修？spec 准确？胶水覆盖？）—— 防止盲目按 KNOWN_ISSUES 历史 spec 接受 ~150 LOC 实施（M-27/M-30 案例 ROI ~25-100×）。SSOT 见 `~/.claude/CLAUDE.md §编码行为准则 Rule 4` |
| post-edit-light | PostToolUse(Edit\|Write) | console.log 警告 + 风险关键词扫描 |
| post-edit-format | PostToolUse(Edit\|Write) | 自动格式化（Biome/Prettier/rustfmt） |
| **lesson-nudge** | PostToolUse(Bash) | fix/perf/refactor commit 后，若本会话 transcript 无 `**Lessons:**` section → 经 **additionalContext 注入**提醒 Claude 写一条可复用教训（接入记忆沉淀管道；2026-06-29 修：原用 stderr+exit0，实测 PostToolUse 该渠道模型看不到 → 提醒石沉大海，见本节 §Hook 输出渠道 SSOT）。每会话 1 次。背景：M-92~M-125 一个月修复全走 commit body / KNOWN_ISSUES，绕过 `**Lessons:** → 提取 → 沉淀` 链 → 项目 long-term 2026-04-27 后停止增长。复刻 fix-depth-check 的"hook 提醒"模式（规则 0% 遵守 → hook 守 100%）。单测 13 用例：`__tests__/lesson-nudge.test.js` |
| **ssot-source-guard** | PostToolUse(Edit\|Write) | Edit/Write **新增**已知 SSOT-risk 读取模式（组件层 `useMarketMidPrice` / `/proxy-`、Rust 直读 `strategy_configs.get(`）时经 additionalContext 软提醒，每会话每文件每模式一次，只看真正新增行。规则见 `~/.claude/CLAUDE.md §编码行为准则 Rule 0`。单测 23 用例 |
| periodic-memory | PostToolUse(*) | 每 30 分钟从 transcript 提取 lessons/decisions（长期会话兜底）；commit 经 `lib/extract-lessons.js::filterNewCommits` 去重（防多触发重复 append today.md） |
| stop-summary | Stop | today.md 轮转 + ~/.memory/index.md 更新 + 错误教训自动沉淀 + commit 去重（`filterNewCommits`，防多次 Stop 触发重复 append → weekly 曾 86% 冗余）+ architecture-rescue 计数器（详见本文件 §architecture-rescue Counter）|
| pre-compact | PreCompact | 压缩前保存状态 |

#### Standard+（标准模式及以上，模式门控）

| Hook | 类型 | 用途 |
|------|------|------|
| drift-detector | PostToolUse(*) | 漂移检测：score = 事件分（revert +15 / 连续 3+ 测试失败 +5，跑绿 -10）+ 广度分（最近 30 个 Edit/Write 滑动窗口，封顶 30）。≥20% / ≥40% 经 additionalContext 注入，档位边沿触发一次。单测 36 用例。详见本文件 §Agent Drift Detection |
| post-edit-typecheck | PostToolUse(Edit) | TS 类型检查（tsc --noEmit） |
| fault-hint | PostToolUse(Edit\|Write) | 容错提示。检测错误处理/外部调用/DB/韧性 pattern → 经 **additionalContext 注入**建议 `/verify fault`（2026-06-29 修：原 `log()`=stderr+exit0 模型看不到；同时修正 settings.json matcher `Bash`→`Edit\|Write`——此前注册在 Bash 下读 `file_path` 永远 undefined → 从未真正触发）|
| cost-tracker | Stop | 成本追踪 |
| suggest-compact | PreToolUse(Edit\|Write) | 压缩建议 |
| session-end | Stop | 持久化会话状态 |
<!-- auto-tmux-dev 已归档 2026-08-02（T-old-coder B1）：文档声称注册但 settings 两层 0 注册（永不触发），文件移 scripts/hooks-archive/ -->
| shared-state-sync | Stop | 任务板维护、stale worker 回收（2026-05-20 从 Heavy-only 下移到 Standard+；Codex N2: Standard 已能 3-5 文件触发, 2026-05-01 字节级一致重复发明事故是 Standard 同步缺失证据） |

#### Heavy-only（重型模式，模式门控）

> **2026-08-02 记忆机器合并（T-old-coder B7，用户批准）**：原 5 个 Heavy-only Stop hook
> （sprint-memory / memory-consolidate / evaluate-session / shared-memory-sync / memory-promote）
> 全部退役归档（`scripts/hooks-archive/`）。依据：与 stop-summary 职责重叠（轮转+沉淀+promote
> 已由 stop-summary 单点承担），且 [2026-06-05] 记忆系统曾静默失效一月无人察觉 = 低信号证据。
> Stop 段现存 4 hook：stop-summary（记忆主干）/ cost-tracker / shared-state-sync（多 session
> 任务板，非记忆）/ session-end（会话状态持久化）。/save-session /resume-session 的 sprint
> 文件读取是 if-exists 优雅降级，不受影响。

| Hook | 类型 | 用途 |
|------|------|------|

### 模式升档机制

模式通过三个入口升档，全部记录到 `.claude/logs/mode-trace.jsonl`：

1. **pre-tool-escalate.js**（自动）— 风险信号检测 + 跨文件累积（3 文件 → Standard，6 文件 → Heavy）
2. **user-prompt-classify.js**（自动）— UserPromptSubmit 检测 fix/bug 关键词 → fast 升 standard
3. **set-mode.js**（手动）— Claude 主动调用：
   - 升档：`node .claude/scripts/hooks/set-mode.js <mode>`
   - 重置：`node .claude/scripts/hooks/set-mode.js --reset --reason "..."` — **必须提供 reason ≥10 字符**，且 20 分钟内只允许重置一次（除非 `--force`）
   - 重置 reason 含 "evaluation"/"gate"/"bypass"/"just a quick" 等可疑词 → 自动阻断（历史原因：原为防 evaluation-gate 绕过，该门已退役）。如确为新任务，传 `--force`
   - 2026-05-01 调参：cooldown 1h→20min（实战发现单 session 多任务边界是常态）；过滤词移除 "commit"（太通用，误伤合法 doc/refactor commit reason）
4. **任务边界自动 reset** — pre-tool-escalate.js 检测到 5 分钟空闲间隔时自动 reset 到 fast（不受手动 cooldown 约束）

规则：只升不降（除非任务边界 reset 或 `set-mode.js --reset --reason "..."`）。

**Reset cooldown**：沿用，防反射式降档；原始动机 evaluation-gate 已于 2026-08-02 退役。

### 可观测性

所有模式变化记录到 `.claude/logs/mode-trace.jsonl`，每行包含：
- `timestamp` — ISO 时间戳
- `trigger` — 触发源（task-router / pre-tool-escalate / set-mode）
- `prev_mode` / `next_mode` — 变化前后的模式
- `reason` — 人可读原因
- `matched_signal` — 触发的具体信号
- `overridden_by_user` — 是否由用户/Claude 手动触发

trace 文件在每次 session init 时自动截断（超过 500 行保留最后 200 行）。

**查询入口**：`/mode-explain` 或 `node ~/.claude/scripts/hooks/mode-explain.js [-n N | --all]` — 显示当前 mode + 最近 N 条变更（who/when/why），不需手动读 JSONL。2026-05-20 新增（Codex N1: 5 个入口可改 mode 但状态不可解释）。

### 降级行为

- Always-on hook 失败：记录 warning 到 stderr，不阻塞任务
- Standard+ hook 失败：降级到 Fast 模式继续
- Heavy-only hook 失败：降级到 Standard 模式

### architecture-rescue Counter（SSOT）

> 实现：`~/.claude/scripts/hooks/stop-summary.js:724-770`
> 状态文件：`~/.claude/state/architecture-rescue.json`（per-project counter + lastRemindedAt）

Stop hook 当前模式 = `heavy` 时，per-project 计数 +1。**触发提醒条件**：① 该项目累计 ≥5 次 Heavy stop ② 距上次提醒 ≥24h。两条件同时满足 → stderr 输出提醒：按 `~/.claude/on-demand/audit-protocol.md` 跑全局审计，或 spawn `Software Architect` agent（`~/.claude/agents/engineering-software-architect.md`）做 deepening pass；计数归零，更新 lastRemindedAt。（2026-09-14 改指：原文案指向的 `/audit` 命令与 `architect` agent 已随 harness 收缩第一步删除，hook 目录当时被排除在扫描外。）

设计动机：Heavy 任务多发期定期触发架构 review，灵感来自 mattpocock/skills `improve-codebase-architecture`，本地化为 passive nudge（不是新流程入口）。

---

## Agent Drift Detection

### How It Works

A PostToolUse hook (`drift-detector.js`) maintains a suspicion score per session:

```
score = min(100, eventScore + breadth)
```

**eventScore** — 累积事件分（clamp 0..100），绿测试衰减：

| Event | Score Change |
|-------|-------------|
| `git revert` / `git checkout --` / `git restore` | +15 |
| 连续第 3+ 次测试失败（每次失败 run） | +5 |
| 每次测试命令跑绿（不只 fail→pass 转换） | -10 |

**breadth** — 广度分，每次从**最近 30 个 Edit/Write 事件的滑动窗口**现算，
从不累积（工作收敛后窗口换血自动归零）：

| Window Signal | Score |
|-------|-------|
| 窗口内 5+ 个唯一逻辑目录（10+ → +20，封顶） | +10 |
| 窗口内同文件编辑 3+ 次（6+ → +10，封顶） | +5 |

逻辑目录对 monorepo 容器归一（`crates/x`、`packages/x`、`apps/x`、`libs/x`、
`services/x` 各算一个目录）——多 crate Rust workspace 天然免疫。breadth 封顶
30：**单靠编辑广度只能到 Warning 档，永远够不到 CRITICAL**（广度是弱证据，
升到 CRITICAL 必须叠加 revert / 测试失败等真实事件信号）。

### Thresholds

- **20%**: Warning message — "Consider pausing to verify direction"
- **40%**: Critical warning — "STOP and run /verify before continuing"

Both thresholds inject via `emitAdditionalContext` (visible to the model),
**edge-triggered on band transitions**（`lastInjectedBand` 0/1/2）：只在升档瞬间
注入一次，同档内 score 继续上涨不重复注入；掉回低档静默复位，之后真升档才会再
报。（2026-07-04 重设计：旧模型 dirs/同文件计数全 session 单调累积、无衰减无
clamp，`scoreChanged` 门对"分数持续上涨"形态失效 → 多 crate workspace 正常开发
被推到 150%+、单 session 15+ 次假阳性 CRITICAL、跑绿 cargo test 也不降分。
2026-06-29 前史：stderr+exit0 模型看不到，见 §Hook 输出渠道 SSOT。）
单测 36 用例：`__tests__/drift-detector.test.js`。

### When It Triggers

Active on all PostToolUse events for Edit, Write, and Bash tools.
Especially valuable during:
- explicitly approved native multi-agent workflows
- bounded independent reviewer sessions
- `ecc-autonomous-loops` scenarios

State stored in `.claude/.drift-state/{session-id}.json`. Resets per session.

---

## Performance Optimization

### Model Selection Strategy — 模式联动自动化

模型选择已与系统模式（Fast/Standard/Heavy）自动联动。

**完整映射表 + 使用规则**详见 `~/.claude/rules/routing.md` §模型自动选择（SSOT）。映射逻辑实现在 `scripts/lib/model-map.js`。

**触发点**：
- `task-router.js`（SessionStart）— 输出 Fast 模式默认模型分配
- `set-mode.js`（手动升档）— 升档后输出新模型分配
- `pre-tool-escalate.js`（自动升档）— 升档后输出新模型分配

**查询**：`node .claude/scripts/hooks/get-model.js <agent-name>`
**覆盖**：`MODEL_MAP_OVERRIDE=engineering-rapid-prototyper:sonnet,engineering-technical-writer:opus`

**模型能力参考**（2026-07-12 刷新到 Claude 5 家族）：
- **Fable 5**（Mythos 级，> Opus）：主会话默认模型，最强判断/裁决。子代理 spawn 不传 `model` 时**默认继承它**（最贵档）——token-heavy 子任务必须显式降档，见 `~/.claude/rules/routing.md §模型自动选择` 使用规则 5
- **Opus 4.8**：最深推理，适合架构决策和复杂审查
- **Sonnet 5**：最佳性价比编码模型，适合主力开发和编排（官方基准：Sonnet + Fable advisor = 92% Fable 质量 @ 63% 成本）
- **Haiku 4.5**：轻量高频 worker，3x 成本节省
- 别名 `haiku`/`sonnet`/`opus`/`fable` 由 harness 解析到当前最新版本，model-map 表内别名无需随版本号更新
