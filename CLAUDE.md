# Triple-System Development Framework

> **所有内容用中文回复。**

Three complementary systems integrated for Claude Code:

| Layer | System | Source | What It Provides |
|-------|--------|--------|-----------------|
| **Infrastructure** | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hooks, memory, learning, 28 commands, common rules |
| **Process** | [Superpowers](https://github.com/obra/superpowers) | obra | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | [Agency Agents](https://github.com/msitarzewski/agency-agents) | msitarzewski | 26 active agents with domain knowledge |

## How They Work Together

```
User Request: "给用户系统加上OAuth登录"
    │
    ├─► ECC Infrastructure (自动触发)
    │   SessionStart → 加载上次会话状态
    │   PreToolUse → 危险命令守卫、编辑冻结
    │   PostToolUse → 自动格式化、类型检查、漂移检测
    │   PreCompact → 上下文压缩前保存状态
    │   Stop → 保存状态、提取模式、追踪成本、记忆整合
    │
    ├─► Superpowers Process (流程纪律)
    │   brainstorming → 探索需求、生成设计文档
    │   writing-plans → 拆解为TDD小任务
    │   test-driven-development → 铁律：先写失败测试
    │   systematic-debugging → 4阶段根因分析
    │   verification-before-completion → 跑验证才能说完成
    │
    └─► Agency Agents Expertise (专业视角)
        Security Engineer → 审计OAuth安全性
        Backend Architect → 设计认证架构
        Code Reviewer → 专业检查清单审查
```

## Priority Order

1. **User's explicit instructions** — always highest
2. **ECC hooks & rules** — infrastructure (100% reliable)
3. **Superpowers skills** — process/workflow (HOW)
4. **Agency Agents personas** — expertise/identity (WHO)

---

## 任务模式路由

> 每个任务开始时，自动判定流程强度并输出摘要。用户指令始终优先于自动路由。
> 详细规则见 `.claude/rules/routing.md`。

| 模式 | 适用场景 | 自动启用 | 禁用 |
|------|---------|---------|------|
| **Fast** | 解释代码、写文档、单文件小改、配置微调 | SessionStart、轻量格式化、最小摘要 | TDD 强制、shared-state、多 agent |
| **Standard** | 普通功能开发、一般 bugfix、跨 2-5 文件 | Fast + 风险提醒、局部质量门、决策记忆 | shared-state、多 agent |
| **Heavy** | 认证/支付/权限/迁移/部署/架构重构 | Standard + shared-state、sprint memory、冲突检测 | — |

**自动升档机制**（`pre-tool-escalate.js`，Always-on）：
- 风险信号检测：auth/payment/deploy 等关键词 → 自动升档
- 跨文件累积：3 文件 → Standard，6 文件 → Heavy
- 任务边界检测：5 分钟空闲间隔 → 自动 reset 到 fast

**手动设定**：`node .claude/scripts/hooks/set-mode.js <mode>`
**手动 reset**：`node .claude/scripts/hooks/set-mode.js --reset`

**可观测性**：所有模式变化记录到 `.claude/logs/mode-trace.jsonl`

**每个任务开始**输出摘要：`[Mode: Fast/Standard/Heavy] 原因 | 自动启用项 | 建议命令`

**推荐命令链**：
- Fast：直接做 → `/verify`
- Standard：`/plan` → 实施 → `/verify`
- Heavy：`/plan` → `/tdd` → 实施 → `/code-review` → `/verify`

---

## 第一性原理 + 一致性守护协议

> 所有任务（含"直接给代码"）必须经过以下流程。不可省略、不可跳步。

### 思考协议（3 步）

**1. 分解到原子事实**
- 列出所有隐含假设，逐条质疑
- 拒绝"别人这么做""惯例""我觉得应该"等非第一性理由
- 明确：这个问题的不可争议的基本事实是什么？

**2. 从零重建方案**
- 只基于确认的事实和约束构建方案
- 选择最本质、最高内聚的路径，而非最快/最熟悉的
- 权衡记录：性能 vs 可读性 vs 维护成本 vs 扩展性

**3. 一致性强制校验**

在输出最终方案前，必须通过以下 7 项检查：

| # | 检查项 | 标准 | 阻断？ |
|---|--------|------|--------|
| 1 | **命名与风格** | 变量/函数/文件/路由命名、缩进、引号、import 顺序与项目现有代码一致 | 是 |
| 2 | **架构分层** | 遵守现有分层规则（领域层不调用 infra、hooks 优先等） | 是 |
| 3 | **契约与接口** | 输入输出类型、错误处理模式与调用方/被调用方一致 | 是 |
| 4 | **单一事实来源(SSOT)** | 无重复常量/类型/配置/逻辑 | 是 |
| 5 | **依赖一致** | 无未批准的新依赖/工具/库版本 | 是 |
| 6 | **文档/类型一致** | JSDoc/TS 类型/注释风格统一 | 是 |
| 7 | **测试通过** | 修改后 lint/type-check/测试预期通过 | 是 |

**评分**：7 项全 ✅ = 10 分。每项 ⚠️ 扣 1 分，每项 ❌ 扣 2 分。
**得分 < 9 或任何 ❌ → 触发一致性阻断**，禁止输出最终方案。

### 一致性阻断规则

以下任一情况**立即停止**，回复阻断模板：

- 任何检查项 ❌
- 得分 < 9
- 引入未批准新依赖/重大架构变更/核心契约破坏，未获用户授权
- 违反 SSOT 或防御性编程原则
- 跳过思考协议步骤

**阻断回复模板**：
```
⛔ 一致性阻断

违反项：
- [#N] 检查项名称：具体问题描述

当前得分：X/10
修复方案：...

是否授权继续？
```

---

## Quick Commands (ECC)

| Command | Purpose | 适用模式 |
|---------|---------|---------|
| `/plan` | 规划实现 | Standard+ |
| `/tdd` | 测试驱动开发 | Standard+ |
| `/verify` | 验证检查 | 所有模式 |
| `/code-review` | 代码审查 | Standard+ |
| `/save-session` | 保存会话 | Standard+ |
| `/resume-session` | 恢复会话 | Standard+ |
| `/e2e` | E2E测试 | Standard+ |
| `/build-fix` | 修复构建 | 所有模式 |
| `/design-consultation` | 设计咨询 | Standard+ |
| `/design-review` | 设计审查 | Standard+ |
| `/careful` | 危险命令守卫 | 所有模式 |
| `/freeze` / `/unfreeze` | 编辑范围锁 | 所有模式 |
| `/learn` | 提取模式 | Standard+ |
| `/codex` | 跨AI审查 | Standard+ |
| `/harness-audit` | 审计配置 | 所有模式 |

## Agent Routing (Agency Agents - auto)

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| Mobile | `engineering-mobile-app-builder` | Code review | `engineering-code-reviewer` |
| AI/ML | `engineering-ai-engineer` | Architecture | `engineering-software-architect` |
| MCP tool | `specialized-mcp-builder` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |
| UI design | `design-ui-designer` | UX structure | `design-ux-architect` |
| UX research | `design-ux-researcher` | Brand | `design-brand-guardian` |

## File Structure (已审计 2026-03-26)

```
.claude/
├── settings.json      ← Hook 配置（按模式分层）
├── agents/            ← 26 个活跃 agents
├── skills/            ← 38 个活跃 skills
├── commands/          ← 28 个活跃 commands
├── rules/             ← 11 个规则文件（common/ + routing.md）
├── scripts/hooks/     ← 29 个 hook 脚本 + lib/ 下 5 个工具模块
├── strategies/        ← Playbooks & runbooks（含 autonomous-permissions.md）
├── shared-state/      ← 多 agent 控制面（仅 Heavy 模式）
├── mcp-configs/       ← MCP server templates
└── examples/          ← Workflow examples
```

### Hook 配置分布（按模式分层）

| 层级 | 类型 | Hooks | 说明 |
|------|------|-------|------|
| **Always-on** | SessionStart | session-start, task-router | 上下文恢复 + 模式 reset + trace 截断 |
| **Always-on** | PreToolUse | careful-guard, freeze-guard, pre-tool-escalate | 安全守卫 + 自动升档 + 跨文件追踪 + 任务边界检测 |
| **Always-on** | PostToolUse | post-edit-light | 轻量格式化 + console.log 警告 |
| **Always-on** | Stop | stop-summary, session-end | 高价值记忆抽取 + 会话状态持久化 |
| **Always-on** | PreCompact | pre-compact | 压缩前保存 |
| **Standard+** | PreToolUse | auto-tmux-dev, suggest-compact | 注册为 Always-on，脚本内 mode-gate |
| **Standard+** | PostToolUse | drift-detector, quality-gate, fault-hint, post-edit-typecheck | 注册为 Always-on，脚本内 mode-gate |
| **Standard+** | Stop | cost-tracker | 注册为 Always-on，脚本内 mode-gate |
| **Heavy** | Stop | evaluate-session, shared-state-sync, sprint-memory, shared-memory-sync, memory-consolidate, memory-promote | 注册为 Always-on，脚本内 mode-gate |

> **注意**：所有 hooks 在 `settings.json` 中均为常驻注册。Standard+/Heavy hooks 通过脚本内 `requireMode()` 决定是否执行逻辑，Fast 模式下自动跳过（透传 stdin）。

### shared-state 任务接管语义

当 Heavy 模式 `shared-state-sync.js` 检测到 stale worker（30 分钟无心跳）时：
1. Worker status → `stale`，随后从 board 移除
2. 其 in_progress 任务：owner 清空、status → `pending`、`needs_reassignment: true`、`stale_reclaimed_at` 记录时间
3. `handoff_note` 保留上下文，供新 agent 参考
4. stderr 输出待重新分配任务清单

新 agent 认领任务时，写入方应清除 `needs_reassignment` 字段。

### 风险控制

当前系统采用**全权限 + hook 守卫**模式（非配置层最小权限）：
- `settings.json` 保持 `Bash(*)`、`Write(*)` 等全开放，避免人工授权打断
- 风险由运行时 hook 守卫承担：`careful-guard`（阻断破坏性命令）、`freeze-guard`（编辑范围锁）、`pre-tool-escalate`（自动升档）
- 三层权限模型（见 `.claude/strategies/autonomous-permissions.md`）是治理框架和可选收紧方案，非默认强制配置

### 降级状态

| 状态 | 含义 |
|------|------|
| `ok` | 正常运行 |
| `warn` | 局部失败，主流程继续 |
| `degraded` | 已关闭部分子系统（如 shared-state），主流程继续 |
| `blocked` | 必须人工处理 |

> 详细降级策略见 `docs/claude-triple-system-level8-redesign/recovery.md`

## 跨工具共享记忆

所有 AI 工具（Claude Code、Codex、OpenClaw）共享的记忆系统。
共享记忆位于**项目根目录**下的 `.memory/`。

```
.memory/
├── RULES.md       ← 使用规则（所有工具必读）
├── today.md       ← 短期：当日工作日志
├── weekly.md      ← 中期：本周摘要（today 次日自动归档）
└── long-term.md   ← 长期：永久知识库
```

**读取**（SessionStart，Always-on）：
- `session-start.js` 启动时按顺序读取 `long-term.md` → `weekly.md` → `today.md`
- 文件缺失时非阻塞，仅记录 stderr 警告

**写入**（分层）：
- Fast/Standard：`stop-summary.js`（Always-on）写入高价值记忆（Decisions/Constraints/Open Loops）到 `today.md`
- Heavy：`shared-memory-sync.js`（Heavy-only）执行完整会话同步和每日归档（today → weekly）

**每日轮转**：
- `stop-summary.js`（Always-on）和 `shared-memory-sync.js`（Heavy）都包含轮转逻辑
- 检测到 today.md 日期非今日时，自动归档到 weekly.md 并重置

详细规则见 `.memory/RULES.md`。

## 错误教训日志

> 被用户纠正或自行发现的错误记录于此，每次会话自动加载，避免重复犯错。
> 格式：`- [日期] 错误描述 → 正确做法`

<!-- 新错误追加在此行下方 -->

- [2026-03-25] 两个 CLAUDE.md 不同步导致规则冲突 → 改一处必须同步另一处
- [2026-03-25] Hook 未做环境检查，缺依赖时阻塞整个流程 → hook 必须优雅降级

---

## Sources (all MIT)

- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
- [obra/superpowers](https://github.com/obra/superpowers)
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
