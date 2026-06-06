# Hooks, Drift Detection & Performance

> 合并自 `hooks.md`、`drift-detection.md`、`performance.md`。
> 三者同属"infrastructure/harness 行为"，合并后降低加载开销。

## Hooks System (Layered)

### 分层架构

Hooks 按模式分层，Fast 模式仅运行 Always-on hooks，减少开销。
Standard+/Heavy hooks 内置模式检查（`lib/mode-check.js`），Fast 模式下自动跳过。

所有 hook 计算 project root 时统一调用 `lib/project-root.js:getProjectRoot()` (或 `lib/utils.js:getProjectRoot()` 套了 git 探测的版本)。该函数有两个守卫：① cwd 落在 `~/.claude/` 内 → 折返到 HOME；② cwd 落在任何 `.memory/` 内 → walk-up 到第一个非 `.memory` 祖先。守卫之二（2026-05-03 加）防止 hook 在 `.memory/` 自身 git repo 内启动时把它当 project root，避免 `.memory/.memory/` 嵌套副本和运行时状态污染 memory repo。

#### Always-on（所有模式）

| Hook | 类型 | 用途 |
|------|------|------|
| session-start | SessionStart | 加载上次会话上下文、检测包管理器 |
| task-router | SessionStart | 重置模式为 fast、清空 escalation-state、截断 trace 日志 |
| rules-loader | SessionStart | 检测项目语言，动态加载 rules-all/ 中对应语言规则 |
| careful-guard | PreToolUse(Bash) | v2 (2026-05-09 重写)：3 组分类。**DENY** 无条件拦（fork bomb / mkfs / dd to /dev/sd* / `rm -rf /` / `rm -rf $HOME`）。**CONTEXTUAL** pattern 命中后跑 context check：`git reset --hard origin/<branch>` + working tree clean → 放行（其余形态如 `HEAD~N`/sha 仍拦）；`git restore .` / `git checkout -- .` 在 clean tree → 放行（no-op）；`rm -rf` 命中 `/tmp/`、`/var/tmp/`、`target/`、`node_modules/`、`build/`、`dist/` → 放行（build 工件）；`git push --force-with-lease` 放行；其余 CONTEXTUAL 拦。**ALLOWLIST_PREFIX** 单 invocation（无 `&&` / `\|\|` / `;` / `\|` / `$()` / backticks）的 git pull/fetch/log/diff/show/blame、`./scripts/{pull,push,deploy,audit,health,check,...}-*.sh`、`./restart.sh` / `./start.sh` / `./stop.sh`、cargo build/check/test/fmt/clippy/run、npm/pnpm install/run/test/build → 直接放行。**命令链**强制走完整 pattern 检查（不走 allowlist）。状态文件 `~/.claude/.careful-enabled`（`off` = 全停）。单测 36 用例：`~/.claude/scripts/hooks/__tests__/careful-guard.test.js` |
| freeze-guard | PreToolUse(Edit\|Write) | 编辑范围冻结守卫（/freeze 机制） |
| pre-tool-escalate | PreToolUse(Bash\|Edit\|Write) | 风险信号升档 + 跨文件累积追踪 + 任务边界检测 |
| **fix-depth-check** | PreToolUse(Bash) | git commit 含 fix 关键字但缺根因解释 → 软警告（不阻塞）。提示补"root cause:"/"because"/"原因"/"根因" |
| **user-prompt-classify** | UserPromptSubmit | 检测 fix/bug/事故关键词 → fast 自动升 standard；session 首条 prompt 注入"深度评估"提示（要求显式 symptom/behavior/root-cause 分级）；**2026-05-21 扩展**：检测 spec/M-X/Wave/Phase/实施 引用 → inject `[Scope-Reflection Required]` 4 问反思（偶发？已修？spec 准确？胶水覆盖？）—— 防止盲目按 KNOWN_ISSUES 历史 spec 接受 ~150 LOC 实施（M-27/M-30 案例 ROI ~25-100×）。SSOT 见 `~/.claude/CLAUDE.md §编码行为准则 Rule 4` |
| post-edit-light | PostToolUse(Edit\|Write) | console.log 警告 + 风险关键词扫描 |
| post-edit-format | PostToolUse(Edit\|Write) | 自动格式化（Biome/Prettier/rustfmt） |
| **lesson-nudge** | PostToolUse(Bash) | fix/perf/refactor commit 后，若本会话 transcript 无 `**Lessons:**` section → stderr 提醒 Claude 写一条可复用教训（接入记忆沉淀管道）。每会话 1 次。背景：M-92~M-125 一个月修复全走 commit body / KNOWN_ISSUES，绕过 `**Lessons:** → 提取 → 沉淀` 链 → 项目 long-term 2026-04-27 后停止增长。复刻 fix-depth-check 的"hook 提醒"模式（规则 0% 遵守 → hook 守 100%）。单测 12 用例：`__tests__/lesson-nudge.test.js` |
| periodic-memory | PostToolUse(*) | 每 30 分钟从 transcript 提取 lessons/decisions（长期会话兜底）；commit 经 `lib/extract-lessons.js::filterNewCommits` 去重（防多触发重复 append today.md） |
| stop-summary | Stop | today.md 轮转 + ~/.memory/index.md 更新 + 错误教训自动沉淀 + commit 去重（`filterNewCommits`，防多次 Stop 触发重复 append → weekly 曾 86% 冗余）+ architecture-rescue 计数器（详见本文件 §architecture-rescue Counter）|
| pre-compact | PreCompact | 压缩前保存状态 |

#### Standard+（标准模式及以上，模式门控）

| Hook | 类型 | 用途 |
|------|------|------|
| drift-detector | PostToolUse(Edit\|Write\|Bash) | 漂移检测（WTF-likelihood 评分） |
| quality-gate | PostToolUse(Edit\|Write) | 局部质量门（格式/lint 检查） |
| post-edit-typecheck | PostToolUse(Edit) | TS 类型检查（tsc --noEmit） |
| fault-hint | PostToolUse(Edit\|Write) | 容错提示 |
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
> 实现：`~/.claude/scripts/hooks/evaluation-gate.js` L240-265
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

| Event | Score Change |
|-------|-------------|
| `git revert` / `git checkout --` / `git restore` | +15% |
| Editing files across 5+ different directories | +10% |
| Same file edited 3+ times | +5% |
| 3+ consecutive test failures | +5% |
| Test transitions from fail to pass | -5% |

### Thresholds

- **20%**: Warning message — "Consider pausing to verify direction"
- **40%**: Critical warning — "STOP and run /verify before continuing"

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

**模型能力参考**：
- **Haiku 4.5**：90% Sonnet 能力，3x 成本节省，适合高频轻量 worker
- **Sonnet 4.6**：最佳编码模型，适合主力开发和编排
- **Opus 4.6**：最深推理，适合架构决策和复杂审查

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
