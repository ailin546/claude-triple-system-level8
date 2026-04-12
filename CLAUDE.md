# Triple-System Development Framework

> **所有内容用中文回复。**

## 系统架构

| Layer | System | What It Provides |
|-------|--------|-----------------|
| **Infrastructure** | ECC | Hooks, memory, learning, 28 commands, common rules |
| **Process** | Superpowers | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | Agency Agents | 26 active agents with domain knowledge |

## 工作流程

```
User Request
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
        按任务类型自动路由到对应领域专家 agent
```

## 优先级

1. **用户显式指令** — 最高优先
2. **ECC hooks & rules** — 基础设施（100% 可靠）
3. **Superpowers skills** — 流程/工作流（HOW）
4. **Agency Agents personas** — 专业知识/角色（WHO）

## 任务模式路由

> 详细规则见 `~/.claude/rules/routing.md`（自动加载）。

**推荐命令链**：
- Fast：直接做 → `/verify`
- Standard：`/plan` → 实施 → `/verify`
- Heavy：`/plan` → `/tdd` → 实施 → `evaluation-loop` → `/code-review` → `/verify`

## Agent 路由

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| AI/ML | `engineering-ai-engineer` | Code review | `engineering-code-reviewer` |
| Architecture | `engineering-software-architect` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |
| DB optimization | `engineering-database-optimizer` | Git workflow | `engineering-git-workflow-master` |
| Technical docs | `engineering-technical-writer` | Performance | `testing-performance-benchmarker` |

## 模型自动选择

Spawn 子 agent 时根据当前模式（`.claude/.task-mode`）选择模型：

| Agent 类别 | Fast | Standard | Heavy |
|-----------|------|----------|-------|
| critical-reasoning（planner, architect） | opus | opus | opus |
| orchestrator | sonnet | opus | opus |
| review（code-reviewer, security-*） | sonnet | opus | opus |
| development（tdd-guide, build-*, frontend, backend...） | sonnet | sonnet | opus |
| worker（doc-updater, refactor-cleaner, e2e-runner...） | haiku | sonnet | sonnet |

查询：`node .claude/scripts/hooks/get-model.js <agent-name>`
映射逻辑：`.claude/scripts/lib/model-map.js`
覆盖：`MODEL_MAP_OVERRIDE=planner:sonnet,doc-updater:opus`

## 风险控制

全权限 + hook 守卫模式：
- hooks 配置在用户级 `~/.claude/settings.json`，所有项目共享
- `careful-guard` — 阻断破坏性命令
- `freeze-guard` — 编辑范围锁
- `pre-tool-escalate` — 高风险操作自动升档

降级策略：Hook 失败时 Always-on 记 warning 继续，Standard+ 降为 Fast，Heavy 降为 Standard。

## Quick Commands

| Command | Purpose | 适用模式 |
|---------|---------|---------|
| `/plan` | 规划实现 | Standard+ |
| `/tdd` | 测试驱动开发 | Standard+ |
| `/verify` | 验证检查 | 所有模式 |
| `/code-review` | 代码审查 | Standard+ |
| `/build-fix` | 修复构建 | 所有模式 |
| `/save-session` / `/resume-session` | 保存/恢复会话 | Standard+ |
| `/careful` | 危险命令守卫开关 | 所有模式 |
| `/freeze` / `/unfreeze` | 编辑范围锁 | 所有模式 |

全部命令见 `~/.claude/commands/` 和 `~/.claude/skills/`。

## 记忆系统（双层）

```
~/.memory/                          ← 全局（跨项目）
├── index.md                        ← 项目索引（hook 自动维护）
├── today.md                        ← 跨项目当日日志
└── long-term.md                    ← 跨项目永久知识

PROJECT/.memory/                    ← 项目级（各项目独立）
├── RULES.md                        ← 使用规则
├── today.md / weekly.md / long-term.md
```

- **读取**：SessionStart 先读全局再读项目级，缺失时静默跳过
- **写入**：项目工作写 `PROJECT/.memory/today.md`，跨项目洞察写 `~/.memory/today.md`
- **每日轮转**：today.md 日期非今日时自动归档到 weekly.md

## 一致性原则

1. **先质疑假设，再动手** — 从事实出发
2. **不重复** — 遵守 SSOT
3. **不破坏** — 引入新依赖或破坏现有接口前，必须获得用户确认

## 错误教训日志

> 格式：`- [日期] 错误描述 → 正确做法`

<!-- 新错误追加在此行下方 -->

- [2026-03-25] 两个 CLAUDE.md 不同步导致规则冲突 → 改一处必须同步另一处
- [2026-03-25] Hook 未做环境检查，缺依赖时阻塞整个流程 → hook 必须优雅降级
- [2026-03-30] Hook 的 mode gate catch 分支 fallthrough → catch 中必须也做 stdin 透传 + exit
- [2026-03-30] Hook 不应 dump 用户原始消息到记忆文件 → hook 只记元数据
