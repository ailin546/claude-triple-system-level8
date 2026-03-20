# Agent Orchestration

## Available Agents

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
