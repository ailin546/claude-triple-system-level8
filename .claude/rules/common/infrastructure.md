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

**给 PostToolUse / PreToolUse hook 注入"给模型看的提醒"的唯一正确渠道 = `emitAdditionalContext`**（exit 0 + stdout 输出 JSON envelope）。exit-2 也能到模型但会把工具标成 error，对温和 nudge 太重，仅 careful-guard/evaluation-gate 这类**阻断**场景用。

**硬契约**：调用 `emitAdditionalContext` 的 hook **禁止**再往 stdout 写任何其他字节（旧的 stdin passthrough 必须删除）——多余字节会让合并后的 stdout 变成非法 JSON，additionalContext 被静默丢弃。

**历史坑**：lesson-nudge / fault-hint / drift-detector 此前用 stderr(或 `log()`)+exit0「提醒 Claude」，但按上表模型根本看不到 → 提醒全部石沉大海（也是项目 long-term memory 2026-04-27 后停止增长的一环：lesson-nudge 沉淀链实际断开）。2026-06-29 三者统一切到 `emitAdditionalContext`。单测：`__tests__/hook-output.test.js`（5 用例）。

#### Always-on（所有模式）

| Hook | 类型 | 用途 |
|------|------|------|
| session-start | SessionStart | 加载上次会话上下文、检测包管理器 |
| task-router | SessionStart | 重置模式为 fast、清空 escalation-state、截断 trace 日志 |
| rules-loader | SessionStart | 检测项目语言，动态加载 rules-all/ 中对应语言规则 |
| careful-guard | PreToolUse(Bash) | v2 (2026-05-09 重写)：3 组分类。**DENY** 无条件拦（fork bomb / mkfs / dd to /dev/sd* / `rm -rf /` / `rm -rf $HOME`）。**CONTEXTUAL** pattern 命中后跑 context check：`git reset --hard origin/<branch>` + working tree clean → 放行（其余形态如 `HEAD~N`/sha 仍拦）；`git restore .` / `git checkout -- .` 在 clean tree → 放行（no-op）；`rm -rf` 命中 `/tmp/`、`/var/tmp/`、`target/`、`node_modules/`、`build/`、`dist/` → 放行（build 工件）；`git push --force-with-lease` 放行；force-push 检测（2026-06-06 修，Codex 审查后加固）只在 `git push` 自己的 segment 内且 redirect-aware（正则 `(?:[^|;&\n]|&(?=[\d>]))*`）：`git push && git branch -f <ref> <sha>` 不跨命令误关联 `-f`（`git branch -f` 移本地 ref，安全，放行），但 `git push origin main 2>&1 -f`（fd-redirect 内的 `&`）仍正确识别为真 force-push 拦下；其余 CONTEXTUAL 拦。**ALLOWLIST_PREFIX** 单 invocation（无 `&&` / `\|\|` / `;` / `\|` / `$()` / backticks）的 git pull/fetch/log/diff/show/blame、`./scripts/{pull,push,deploy,audit,health,check,...}-*.sh`、`./restart.sh` / `./start.sh` / `./stop.sh`、cargo build/check/test/fmt/clippy/run、npm/pnpm install/run/test/build → 直接放行。**命令链**强制走完整 pattern 检查（不走 allowlist）。状态文件 `~/.claude/.careful-enabled`（`off` = 全停）。单测 42 用例：`~/.claude/scripts/hooks/__tests__/careful-guard.test.js` |
| freeze-guard | PreToolUse(Edit\|Write) | 编辑范围冻结守卫（/freeze 机制） |
| pre-tool-escalate | PreToolUse(Bash\|Edit\|Write) | 风险信号升档 + 跨文件累积追踪 + 任务边界检测。**Bash 命令匹配（2026-06-06 修）**：按 segment 拆分（`lib/command-scan.js`）+ strip quotes 后逐段匹配，跳过 `set-mode.js` 段（降档工具不当 risk）；git VCS 操作（commit/push/add）**不再**作为升档信号（版控机制非任务性质，routing.md 从未列其为触发）→ 根治 `set-mode --reset && git push` 链被反复升回 heavy 的死循环。**hyphen-aware 关键词边界（2026-06-13 修）**：单词风险 verb（`deploy`/`migrate`/`terraform`/...）改 `(?<![\w-])…(?![\w-])` 匹配——JS `\b` 把 `-` 当词边界，旧 `/\bdeploy\b/` 误匹配项目目录名 `quant-deploy`（`cd …/quant-deploy`、`git -C …/quant-deploy`）→ 每次 commit 被假升 heavy → evaluation-gate 死锁（同 2026-06-06 子串匹配类）；新边界放行 `quant-deploy` 路径，仍匹配 `deploy`/`./deploy.sh`/`npm run deploy`。**跨文件计数 docs 豁免（2026-07-16 修）**：纯文档扩展名（`.md`/`.markdown`/`.rst`/`.adoc`/`.asciidoc`/`.txt`）不进 filesTracked——计数器是"跨模块代码复杂度"代理，routing.md 明确"写文档 → Fast"，批量 docs 机械编辑（wikimind 18 md 单日 3 次假升 heavy → evaluation-gate 拦 docs-only commit）不应触发阈值；`.json`/`.yaml`/`.toml`/`.mdx` 仍计数（承载运行时行为，修假阳性不开假阴性）。**目录名信号 docs 豁免（2026-07-17 修）**：Edit/Write 的目录名风险信号（auth/ deploy/ shared-state/ api/ 等路径段）对纯文档同样豁免（`isProseDocPath` 短路 `detectEscalation`）——`docs/deploy/guide.md` 是关于敏感域的文档而非对敏感域的改动，且与计数器不同**无阈值缓冲、首次 Edit 即直升 heavy** 与 evaluation-gate 互锁；无事故记录但暴露面实证存在（cc/paperclip `docs/deploy/` ×9 → heavy、`docs/api/` ×11 → standard、`shared-state/README.md` → heavy），按 2026-07-16 元教训主动免疫而非等事故；行为承载文件（`.ts`/`.json`/`.sh`/`.mdx`/无扩展名）在风险目录下仍升档（fail-closed）。单测 41 用例：`__tests__/pre-tool-escalate.test.js` |
| **fix-depth-check** | PreToolUse(Bash) | git commit 含 fix 关键字但缺根因解释 → 软警告（不阻塞）。提示补"root cause:"/"because"/"原因"/"根因" |
| **user-prompt-classify** | UserPromptSubmit | 检测 fix/bug/事故关键词 → fast 自动升 standard；session 首条 prompt 注入"深度评估"提示（要求显式 symptom/behavior/root-cause 分级）；**2026-05-21 扩展**：检测 spec/M-X/Wave/Phase/实施 引用 → inject `[Scope-Reflection Required]` 4 问反思（偶发？已修？spec 准确？胶水覆盖？）—— 防止盲目按 KNOWN_ISSUES 历史 spec 接受 ~150 LOC 实施（M-27/M-30 案例 ROI ~25-100×）。SSOT 见 `~/.claude/CLAUDE.md §编码行为准则 Rule 4` |
| post-edit-light | PostToolUse(Edit\|Write) | console.log 警告 + 风险关键词扫描 |
| post-edit-format | PostToolUse(Edit\|Write) | 自动格式化（Biome/Prettier/rustfmt） |
| **lesson-nudge** | PostToolUse(Bash) | fix/perf/refactor commit 后，若本会话 transcript 无 `**Lessons:**` section → 经 **additionalContext 注入**提醒 Claude 写一条可复用教训（接入记忆沉淀管道；2026-06-29 修：原用 stderr+exit0，实测 PostToolUse 该渠道模型看不到 → 提醒石沉大海，见本节 §Hook 输出渠道 SSOT）。每会话 1 次。背景：M-92~M-125 一个月修复全走 commit body / KNOWN_ISSUES，绕过 `**Lessons:** → 提取 → 沉淀` 链 → 项目 long-term 2026-04-27 后停止增长。复刻 fix-depth-check 的"hook 提醒"模式（规则 0% 遵守 → hook 守 100%）。单测 13 用例：`__tests__/lesson-nudge.test.js` |
| **ssot-source-guard** | PostToolUse(Edit\|Write) | Edit/Write **新增**已知 SSOT-risk 读取模式时经 **additionalContext 注入**软提醒（每会话每文件每模式一次；2026-06-29 修：原 stderr+exit0 模型看不到，见本节 §Hook 输出渠道 SSOT）。种子模式（精确、低假阳性）：组件层（`components/`\|`pages/`\|`views/` 下 .tsx/.jsx/.vue）加 `useMarketMidPrice` 或 `/proxy-` 字面量；Rust 直读 `strategy_configs.get(`。检测仅看**真正新增行**（Edit/MultiEdit diff `old_string`，保留的旧违规行不触发；Write 全文），strip 注释（含行内 `/* */` 块注释，但保留 `://` URL scheme 让真 `/proxy-` 仍匹配）。背景：单会话连发 4 个"逻辑字段长出第 2 个源→漂移"bug；复刻 fix-depth-check/lesson-nudge"规则 0% 遵守→hook 守 100%"。SSOT 见 `~/.claude/CLAUDE.md §SSOT 单一访问器铁律`。单测 23 用例：`__tests__/ssot-source-guard.test.js` |
| periodic-memory | PostToolUse(*) | 每 30 分钟从 transcript 提取 lessons/decisions（长期会话兜底）；commit 经 `lib/extract-lessons.js::filterNewCommits` 去重（防多触发重复 append today.md） |
| stop-summary | Stop | today.md 轮转 + ~/.memory/index.md 更新 + 错误教训自动沉淀 + commit 去重（`filterNewCommits`，防多次 Stop 触发重复 append → weekly 曾 86% 冗余）+ architecture-rescue 计数器（详见本文件 §architecture-rescue Counter）|
| pre-compact | PreCompact | 压缩前保存状态 |

#### Standard+（标准模式及以上，模式门控）

| Hook | 类型 | 用途 |
|------|------|------|
| drift-detector | PostToolUse(*) | 漂移检测（WTF-likelihood 评分）。≥20%/≥40% 警告经 **additionalContext 注入**（2026-06-29 修：原 stderr+exit0 模型看不到）。**2026-07-04 评分模型重设计**：score = 事件分（revert +15 / 连续 3+ 测试失败 +5，每次跑绿测试 -10 衰减，clamp 100）+ 广度分（最近 30 个 Edit/Write 滑动窗口现算，从不累积；目录按 monorepo 容器 `crates/x` 等归一；封顶 30——广度单独够不到 CRITICAL）。注入改档位边沿触发（`lastInjectedBand`），同档内涨分不重复注入——根治旧模型全 session 单调累积 + `scoreChanged` 门失效导致的 150%+ 假阳性 CRITICAL 刷屏。单测 36 用例：`__tests__/drift-detector.test.js` 详见 §Agent Drift Detection |
| quality-gate | PostToolUse(Edit\|Write) | 局部质量门（格式/lint 检查） |
| post-edit-typecheck | PostToolUse(Edit) | TS 类型检查（tsc --noEmit） |
| fault-hint | PostToolUse(Edit\|Write) | 容错提示。检测错误处理/外部调用/DB/韧性 pattern → 经 **additionalContext 注入**建议 `/verify fault`（2026-06-29 修：原 `log()`=stderr+exit0 模型看不到；同时修正 settings.json matcher `Bash`→`Edit\|Write`——此前注册在 Bash 下读 `file_path` 永远 undefined → 从未真正触发）|
| cost-tracker | Stop | 成本追踪 |
| suggest-compact | PreToolUse(Edit\|Write) | 压缩建议 |
| auto-tmux-dev | PreToolUse(Bash) | tmux 自动启动 dev server |
| session-end | Stop | 持久化会话状态 |
| shared-state-sync | Stop | 任务板维护、stale worker 回收（2026-05-20 从 Heavy-only 下移到 Standard+；Codex N2: Standard 已能 3-5 文件触发, 2026-05-01 字节级一致重复发明事故是 Standard 同步缺失证据） |

#### Heavy-only（重型模式，模式门控）

| Hook | 类型 | 用途 |
|------|------|------|
| sprint-memory | Stop | 跨会话目标记录 |
| memory-consolidate | Stop | 长期记忆沉淀 |
| evaluate-session | Stop | 提取可复用模式 |
| shared-memory-sync | Stop | 跨工具共享记忆同步 |
| memory-promote | Stop | ECC instinct 推广（与 stop-summary 的错误教训沉淀不同） |

### 模式升档机制

模式通过三个入口升档，全部记录到 `.claude/logs/mode-trace.jsonl`：

1. **pre-tool-escalate.js**（自动）— 风险信号检测 + 跨文件累积（3 文件 → Standard，6 文件 → Heavy）
2. **user-prompt-classify.js**（自动）— UserPromptSubmit 检测 fix/bug 关键词 → fast 升 standard
3. **set-mode.js**（手动）— Claude 主动调用：
   - 升档：`node .claude/scripts/hooks/set-mode.js <mode>`
   - 重置：`node .claude/scripts/hooks/set-mode.js --reset --reason "..."` — **必须提供 reason ≥10 字符**，且 20 分钟内只允许重置一次（除非 `--force`）
   - 重置 reason 含 "evaluation"/"gate"/"bypass"/"just a quick" 等可疑词 → 自动阻断（防 evaluation-gate 绕过）。如确为新任务，传 `--force`
   - 2026-05-01 调参：cooldown 1h→20min（实战发现单 session 多任务边界是常态）；过滤词移除 "commit"（太通用，误伤合法 doc/refactor commit reason）
4. **任务边界自动 reset** — pre-tool-escalate.js 检测到 5 分钟空闲间隔时自动 reset 到 fast（不受手动 cooldown 约束）

规则：只升不降（除非任务边界 reset 或 `set-mode.js --reset --reason "..."`）。

**Reset cooldown 设计动机**：`--reset` 之前是绕过 evaluation-gate 的零摩擦逃生通道（"被阻断 → reset → 再 commit"）。Cooldown + reason 强制 Claude 在重置前思考一次，避免反射式 reset 把 Heavy 任务降级。这是为 long-term correctness 设计的反"快速能用"摩擦。

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

### evaluation-gate Marker Schema（SSOT）

> 2026-05-20 SSOT 审计发现：marker schema 之前只存在 hook 源码 + 历史日志，无规则层 SSOT。本节是规则层声明。
> 实现：`~/.claude/scripts/hooks/evaluation-gate.js` L250-291（marker 分层校验 → exit 2；行号 2026-06-06 随 `isCommitOrPush` 改动更新）
> 状态文件：`~/.claude/state/evaluation-gate/last-pass.json`

Heavy 模式下 `git commit/push` 必须有 pass marker，否则 hook exit 2 阻断。Marker 文件结构（**所有 required field 缺一不可**）：

```json
{
  "ts": 1747000000000,
  "git_head": "<7-char short hash of HEAD at evaluation time>",
  "mode": "heavy",
  "round": <integer>,
  "evaluator_agent_id": "<Task agent id, non-empty>",
  "verdict_summary": "<≥10 chars Reality Checker ACCEPTED reason>"
}
```

**Hook 严格校验的 fields**（缺一或不符即 marker 失效）：
- `ts` — Unix epoch ms，hook 检查 staleness（默认 2h TTL）
- `git_head` — short hash 必须 **等于** 当前 HEAD（否则 marker 失效，提示"code changed since evaluation — re-run"）
- `evaluator_agent_id` — 非空且 `String(...).length >= 3`（防 Claude 自填空串/单字符绕过）
- `verdict_summary` — `String(...).trim().length >= 10` 字符（防占位符如 "ok"/"pass"）

**Hook 不校验但 Claude 写 marker 时应填的信息字段**（hook stderr 指引要求，但不强制）：
- `mode` — 写 `"heavy"`（Standard/Fast 模式 hook 整体不触发 marker 检查，此字段仅作信息存储；若未来加 mode 校验需先改 hook）
- `round` — evaluation-loop 轮数（信息字段，不校验）

**谁可写入**：仅 Heavy 模式 evaluation-loop skill 的 Step 4 输出（独立 Reality Checker / Systems Reality Checker agent 完成评估后写入）。**主 agent 禁止直接生产 marker**——这是 Codex 之前评估的"防自证闭环"机制（仍有"同生态可生成 valid-looking marker"残余风险）。

**何时失效**：① `git_head` 与当前 HEAD 不一致 ② `ts` 超过 2h ③ 任一 required field 缺失或格式错。失效后 hook 输出 reason + 指引 re-run `/evaluation-loop`。

**Cross-context 豁免**：命令以 `cd /other-repo && ...` 起始且目标不在 projectRoot 内 → hook exit 0 豁免（避免阻断 cross-repo push，2026-05-03 事故修复）。

### architecture-rescue Counter（SSOT）

> 实现：`~/.claude/scripts/hooks/stop-summary.js:718-759`
> 状态文件：`~/.claude/state/architecture-rescue.json`（per-project counter + lastRemindedAt）

Stop hook 当前模式 = `heavy` 时，per-project 计数 +1。**触发提醒条件**：① 该项目累计 ≥5 次 Heavy stop ② 距上次提醒 ≥24h。两条件同时满足 → stderr 输出"考虑 /audit 或 spawn architect agent for a deepening pass"，计数归零，更新 lastRemindedAt。

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
- `dispatching-parallel-agents` workflows
- `subagent-driven-development` sessions
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
**覆盖**：`MODEL_MAP_OVERRIDE=planner:sonnet,doc-updater:opus`

**模型能力参考**（2026-07-12 刷新到 Claude 5 家族）：
- **Fable 5**（Mythos 级，> Opus）：主会话默认模型，最强判断/裁决。子代理 spawn 不传 `model` 时**默认继承它**（最贵档）——token-heavy 子任务必须显式降档，见 `~/.claude/rules/routing.md §模型自动选择` 使用规则 5
- **Opus 4.8**：最深推理，适合架构决策和复杂审查
- **Sonnet 5**：最佳性价比编码模型，适合主力开发和编排（官方基准：Sonnet + Fable advisor = 92% Fable 质量 @ 63% 成本）
- **Haiku 4.5**：轻量高频 worker，3x 成本节省
- 别名 `haiku`/`sonnet`/`opus`/`fable` 由 harness 解析到当前最新版本，model-map 表内别名无需随版本号更新

### Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

### Extended Thinking + Plan Mode

Extended thinking is enabled by default, reserving up to 31,999 tokens for internal reasoning.

Control extended thinking via:
- **Toggle**: Option+T (macOS) / Alt+T (Windows/Linux)
- **Config**: Set `alwaysThinkingEnabled` in `~/.claude/settings.json`
- **Budget cap**: `export MAX_THINKING_TOKENS=10000`
- **Verbose mode**: Ctrl+O to see thinking output

For complex tasks requiring deep reasoning:
1. Ensure extended thinking is enabled (on by default)
2. Enable **Plan Mode** for structured approach
3. Use multiple critique rounds for thorough analysis
4. Use split role sub-agents for diverse perspectives

### Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
