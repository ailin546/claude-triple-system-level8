# Hooks, Drift Detection & Performance

> 合并自 `hooks.md`、`drift-detection.md`、`performance.md`。
> 三者同属"infrastructure/harness 行为"，合并后降低加载开销。

## Hooks System (Layered)

### 分层架构

Hooks 按模式分层，Fast 模式仅运行 Always-on hooks，减少开销。
Standard+/Heavy hooks 内置模式检查（`lib/mode-check.js`），Fast 模式下自动跳过。

#### Always-on（所有模式）

| Hook | 类型 | 用途 |
|------|------|------|
| session-start | SessionStart | 加载上次会话上下文、检测包管理器 |
| task-router | SessionStart | 重置模式为 fast、清空 escalation-state、截断 trace 日志 |
| rules-loader | SessionStart | 检测项目语言，动态加载 rules-all/ 中对应语言规则 |
| careful-guard | PreToolUse(Bash) | 拦截危险命令（rm -rf, DROP TABLE 等） |
| freeze-guard | PreToolUse(Edit\|Write) | 编辑范围冻结守卫（/freeze 机制） |
| pre-tool-escalate | PreToolUse(Bash\|Edit\|Write) | 风险信号升档 + 跨文件累积追踪 + 任务边界检测 |
| post-edit-light | PostToolUse(Edit\|Write) | console.log 警告 + 风险关键词扫描 |
| post-edit-format | PostToolUse(Edit\|Write) | 自动格式化（Biome/Prettier/rustfmt） |
| stop-summary | Stop | today.md 轮转 + ~/.memory/index.md 更新 + 错误教训自动沉淀 |
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

#### Heavy-only（重型模式，模式门控）

| Hook | 类型 | 用途 |
|------|------|------|
| shared-state-sync | Stop | 任务板维护、stale worker 回收、需重新分配任务标记 |
| sprint-memory | Stop | 跨会话目标记录 |
| memory-consolidate | Stop | 长期记忆沉淀 |
| evaluate-session | Stop | 提取可复用模式 |
| shared-memory-sync | Stop | 跨工具共享记忆同步 |
| memory-promote | Stop | ECC instinct 推广（与 stop-summary 的错误教训沉淀不同） |

### 模式升档机制

模式通过三个入口升档，全部记录到 `.claude/logs/mode-trace.jsonl`：

1. **pre-tool-escalate.js**（自动）— 风险信号检测 + 跨文件累积（3 文件 → Standard，6 文件 → Heavy）
2. **set-mode.js**（手动）— Claude 主动调用 `node .claude/scripts/hooks/set-mode.js <mode>`
3. **任务边界自动 reset** — pre-tool-escalate.js 检测到 5 分钟空闲间隔时自动 reset 到 fast

规则：只升不降（除非任务边界 reset 或 `set-mode.js --reset`）。

### 可观测性

所有模式变化记录到 `.claude/logs/mode-trace.jsonl`，每行包含：
- `timestamp` — ISO 时间戳
- `trigger` — 触发源（task-router / pre-tool-escalate / set-mode）
- `prev_mode` / `next_mode` — 变化前后的模式
- `reason` — 人可读原因
- `matched_signal` — 触发的具体信号
- `overridden_by_user` — 是否由用户/Claude 手动触发

trace 文件在每次 session init 时自动截断（超过 500 行保留最后 200 行）。

### 降级行为

- Always-on hook 失败：记录 warning 到 stderr，不阻塞任务
- Standard+ hook 失败：降级到 Fast 模式继续
- Heavy-only hook 失败：降级到 Standard 模式

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

### Model Selection Strategy

**Haiku 4.5** (90% of Sonnet capability, 3x cost savings):
- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Sonnet 4.6** (Best coding model):
- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Opus 4.6** (Deepest reasoning):
- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks

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
