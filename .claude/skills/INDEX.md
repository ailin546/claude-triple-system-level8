# User-Level Skills Index

> 29 active skills @ ~/.claude/skills/. Shared workflow alignment refreshed 2026-08-12.
> All frontmatter validated (name + description only). Reference skills (1500+w) split to overview + subdocs.

## Process & Workflow

- [brainstorming](brainstorming/SKILL.md) — Conditional Requirement Confirmation for ambiguous or Brownfield work; no automatic document/review loop
- [specify](specify/SKILL.md) — Use before /plan in Standard+ mode to lock down task constitution — AC, scope, inviolable principles
- [writing-plans](writing-plans/SKILL.md) — Use when you have a spec or requirements for a multi-step task, before touching code
- [executing-plans](executing-plans/SKILL.md) — Execute an approved plan through implementation and relevant verification
- [verification-before-completion](verification-before-completion/SKILL.md) — Use when about to claim work is complete, before committing or creating PRs
- [scope-drift-detection](scope-drift-detection/SKILL.md) — Use before code review or PR creation to detect scope drift vs original task intent

## Code Quality & Review

> **共享审查预算**：Fast 默认只 `/verify`；Standard/Heavy 按风险一次 `/code-review`；
> 只有修复 Critical/High 后允许一次复核。`evaluation-loop` 仅用于具备基线和指标的改进任务。

- [requesting-code-review](requesting-code-review/SKILL.md) — One bounded Review Gate before delivery or merge for non-trivial/high-risk changes
- [qa-health-score](qa-health-score/SKILL.md) — Use after /verify or before PR creation to compute a quantitative 0-100 codebase health score
- [evaluation-loop](evaluation-loop/SKILL.md) — Bounded measurable improvement loop; not a default delivery stage
- [ecc-coding-standards](ecc-coding-standards/SKILL.md) — Use when writing or reviewing TypeScript/JavaScript code — universal style/quality rules
- [codex-review](codex-review/SKILL.md) — Cross-AI code review via OpenAI Codex CLI for independent second-opinion before merging

## Frontend / UI

- [ui-ux-pro-max](ui-ux-pro-max/SKILL.md) — Use when starting a new UI design and need data-backed style, color palette, and product template selection
- [design-consultation](design-consultation/SKILL.md) — Use before implementation when planning new pages, components, or user flows
- [design-review](design-review/SKILL.md) — Use when UI components or styles have just been implemented and need quality audit before PR
- [ecc-frontend-patterns](ecc-frontend-patterns/SKILL.md) — Use when implementing React or Next.js frontend code — state management, performance, UI patterns
- [ecc-e2e-testing](ecc-e2e-testing/SKILL.md) — Use when writing or maintaining Playwright E2E tests — Page Object Model, CI integration

## Backend / API

- [ecc-backend-patterns](ecc-backend-patterns/SKILL.md) — Use when designing or reviewing backend code — Node.js/Express/Next.js API routes, database access
- [ecc-api-design](ecc-api-design/SKILL.md) — Use when designing or reviewing REST API endpoints — resource naming, status codes, pagination, filtering
- [ecc-cost-aware-llm-pipeline](ecc-cost-aware-llm-pipeline/SKILL.md) — Use when building LLM-powered apps — model routing by complexity, budget tracking, retry logic

## Database / Infrastructure（已归档 2026-08-02）

> ecc-postgres-patterns / ecc-database-migrations / ecc-deployment-patterns / ecc-docker-patterns
> 四技能移入 `skills-archive/`（T-old-coder B10：活跃项目栈 Rust+SQLite+React，无 Postgres/Docker/
> SQL-migration 面，技能列表逐条进 session context = 常驻 token 税）。需要时 `/restore` 恢复。

## Security

- [ecc-security-review](ecc-security-review/SKILL.md) — Use when adding authentication, handling user input, working with secrets, or creating API endpoints
- [ecc-security-scan](ecc-security-scan/SKILL.md) — Use when auditing the .claude/ configuration directory for security risks and misconfigurations

## Skill / Memory Engineering

- [ecc-continuous-learning-v2](ecc-continuous-learning-v2/SKILL.md) — Use when wanting to extract reusable patterns from sessions and evolve them into skills/commands
- [ecc-eval-harness](ecc-eval-harness/SKILL.md) — Use when defining a formal evaluation harness for Claude Code sessions (eval-driven development)
- [ecc-strategic-compact](ecc-strategic-compact/SKILL.md) — Use when in long sessions approaching context limits — suggests compaction at logical task-phase boundaries
- [shared-state-sync](shared-state-sync/SKILL.md) — Use when multiple agents need to coordinate via shared state — read/write board.json, decisions.log
- [ecc-configure-ecc](ecc-configure-ecc/SKILL.md) — Use when installing, uninstalling, or upgrading Everything Claude Code (ECC) components

## Multi-Agent / Plans

- [writing-plans](writing-plans/SKILL.md) — Use when you have a spec or requirements for a multi-step task, before touching code
- [executing-plans](executing-plans/SKILL.md) — Use when executing a written implementation plan with review checkpoints
- [ecc-blueprint](ecc-blueprint/SKILL.md) — Use when planning a complex multi-PR or multi-session engineering project

## Output Control

- [caveman](caveman/SKILL.md) — Use when user invokes /caveman or asks for less tokens — compresses output ~75%, auto-disabled in structured-output contexts (evaluation-loop / code-review / verify / safety)

## Misc

- [ecc-search-first](ecc-search-first/SKILL.md) — Use before writing custom code for any non-trivial feature — searches GitHub/npm/PyPI for existing tools
