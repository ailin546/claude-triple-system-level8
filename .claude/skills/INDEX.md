# User-Level Skills Index

> 40 skills @ ~/.claude/skills/. Last optimized 2026-05-01.
> All frontmatter validated (name + description only). Reference skills (1500+w) split to overview + subdocs.

## Process & Workflow

- [brainstorming](brainstorming/SKILL.md) — Use before any creative work to explore user intent, requirements, and design options
- [specify](specify/SKILL.md) — Use before /plan in Standard+ mode to lock down task constitution — AC, scope, inviolable principles
- [writing-plans](writing-plans/SKILL.md) — Use when you have a spec or requirements for a multi-step task, before touching code
- [executing-plans](executing-plans/SKILL.md) — Use when you have a written implementation plan to execute in a separate session with review checkpoints
- [using-superpowers](using-superpowers/SKILL.md) — Use when starting any conversation — establishes how to find and use skills
- [verification-before-completion](verification-before-completion/SKILL.md) — Use when about to claim work is complete, before committing or creating PRs
- [finishing-a-development-branch](finishing-a-development-branch/SKILL.md) — Use when implementation is complete and you need to decide how to integrate the work
- [scope-drift-detection](scope-drift-detection/SKILL.md) — Use before code review or PR creation to detect scope drift vs original task intent
- [systematic-debugging](systematic-debugging/SKILL.md) — Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes

## Code Quality & Review

- [test-driven-development](test-driven-development/SKILL.md) — Use when implementing any feature or bugfix, before writing implementation code
- [requesting-code-review](requesting-code-review/SKILL.md) — Use when completing tasks, implementing major features, or before merging
- [receiving-code-review](receiving-code-review/SKILL.md) — Use when receiving code review feedback, before implementing suggestions
- [qa-health-score](qa-health-score/SKILL.md) — Use after /verify or before PR creation to compute a quantitative 0-100 codebase health score
- [evaluation-loop](evaluation-loop/SKILL.md) — Use after Heavy-mode feature implementation, before /verify — Generator-Evaluator loop
- [ecc-coding-standards](ecc-coding-standards/SKILL.md) — Use when writing or reviewing TypeScript/JavaScript code — universal style/quality rules

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

## Database

- [ecc-postgres-patterns](ecc-postgres-patterns/SKILL.md) — Use when writing PostgreSQL queries, designing schemas, choosing indexes, or troubleshooting performance
- [ecc-database-migrations](ecc-database-migrations/SKILL.md) — Use when writing database migrations — schema changes, data backfills, rollbacks, zero-downtime patterns

## Infrastructure / Deployment

- [ecc-deployment-patterns](ecc-deployment-patterns/SKILL.md) — Use when planning deployment workflow, CI/CD pipeline, health checks, or rollback strategy
- [ecc-docker-patterns](ecc-docker-patterns/SKILL.md) — Use when writing Docker / Docker Compose for local dev, container security, networking, volumes
- [using-git-worktrees](using-git-worktrees/SKILL.md) — Use when starting feature work that needs isolation from current workspace

## Security

- [ecc-security-review](ecc-security-review/SKILL.md) — Use when adding authentication, handling user input, working with secrets, or creating API endpoints
- [ecc-security-scan](ecc-security-scan/SKILL.md) — Use when auditing the .claude/ configuration directory for security risks and misconfigurations

## Skill / Memory Engineering

- [writing-skills](writing-skills/SKILL.md) — Use when creating new skills, editing existing skills, or verifying skills before deployment
- [ecc-continuous-learning-v2](ecc-continuous-learning-v2/SKILL.md) — Use when wanting to extract reusable patterns from sessions and evolve them into skills/commands
- [ecc-eval-harness](ecc-eval-harness/SKILL.md) — Use when defining a formal evaluation harness for Claude Code sessions (eval-driven development)
- [ecc-strategic-compact](ecc-strategic-compact/SKILL.md) — Use when in long sessions approaching context limits — suggests compaction at logical task-phase boundaries
- [shared-state-sync](shared-state-sync/SKILL.md) — Use when multiple agents need to coordinate via shared state — read/write board.json, decisions.log
- [ecc-configure-ecc](ecc-configure-ecc/SKILL.md) — Use when installing, uninstalling, or upgrading Everything Claude Code (ECC) components

## Multi-Agent / Plans

- [writing-plans](writing-plans/SKILL.md) — Use when you have a spec or requirements for a multi-step task, before touching code
- [executing-plans](executing-plans/SKILL.md) — Use when executing a written implementation plan with review checkpoints
- [ecc-blueprint](ecc-blueprint/SKILL.md) — Use when planning a complex multi-PR or multi-session engineering project
- [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md) — Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
- [subagent-driven-development](subagent-driven-development/SKILL.md) — Use when executing implementation plans with independent tasks in the current session

## Misc

- [ecc-search-first](ecc-search-first/SKILL.md) — Use before writing custom code for any non-trivial feature — searches GitHub/npm/PyPI for existing tools
