# Agent Orchestration

> 本文件覆盖**基础设施 agent**（流程纪律：planner/tdd-guide/code-reviewer 等，lowercase frontmatter 名）。**专长 agent**（领域知识：Frontend Developer/Backend Architect 等，Capital Phrase 名）见 `~/.claude/CLAUDE.md` §Agent 路由。spawn 时一律用 frontmatter `name` 字段值。

## Available Agents (基础设施)

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| database-reviewer | DB query/schema review | When writing SQL/migrations |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent
5. UI/UX work starting - Use **design-consultation** skill (auto-trigger, see below)
6. UI code just written - Use **design-review** skill (auto-trigger, see below)

## Design System Auto-Trigger

When the task involves UI/visual changes, the design system activates automatically:

**Before implementation** — auto-invoke `design-consultation` skill when the request involves:
- New pages, screens, or layouts
- New UI components (buttons, forms, cards, modals, navigation)
- Color, typography, or spacing changes
- Responsive design or dark mode work
- UX flow changes or information architecture

**After implementation** — auto-invoke `design-review` skill when:
- CSS/SCSS/styling files have been created or modified
- Component files (.tsx/.jsx/.vue/.svelte) with visual elements were changed
- Design tokens or theme variables were added/modified

Detection: if changed files match `*.css|*.scss|*.less|*.tsx|*.jsx|*.vue|*.svelte` AND contain visual keywords (color, margin, padding, font, display, grid, flex, background, border, shadow, theme), auto-trigger design-review before code-review.

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## Audit Task Routing（强制）

当用户要求全局性审查/审计时，**必须遵循 `~/.claude/on-demand/audit-protocol.md`**（按需加载，不在 common 下自动加载）；走 `/audit` 或 `/audit-crate` 命令时由命令入口显式引入。不可自行编排。

关键约束：
1. **Explore agent 不出结论** — 只做信息收集，HIGH+ 判定必须由有 Bash 能力的 agent 或主 agent 验证
2. **安全独立启动** — security-reviewer 必须作为独立 agent，不可合并到功能审计
3. **主 agent 亲自验证** — 所有 HIGH+ 发现必须由主 agent 运行验证命令确认
4. **4 阶段流程** — 信息收集 → 安全审计 → 主 agent 验证 → 对抗性审查
