# Development Workflow

> This file extends [common/git-workflow.md](./git-workflow.md) with the full feature development process that happens before git operations.

The Feature Implementation Workflow describes the development pipeline: research, planning, TDD, code review, and then committing to git.

## Feature Implementation Workflow

> 以下流程适用于 **Standard+ 模式**的功能开发。
> Fast 模式下仅需：直接实现 → `/verify` → commit。
> 各阶段可按实际需要裁剪，非所有步骤都强制执行。

0. **Research & Reuse** _(mandatory before any new implementation)_
   - **GitHub code search first:** Run `gh search repos` and `gh search code` to find existing implementations, templates, and patterns before writing anything new.
   - **Library docs second:** Use Context7 or primary vendor docs to confirm API behavior, package usage, and version-specific details before implementing.
   - **Exa only when the first two are insufficient:** Use Exa for broader web research or discovery after GitHub search and primary docs.
   - **Check package registries:** Search npm, PyPI, crates.io, and other registries before writing utility code. Prefer battle-tested libraries over hand-rolled solutions.
   - **Search for adaptable implementations:** Look for open-source projects that solve 80%+ of the problem and can be forked, ported, or wrapped.
   - Prefer adopting or porting a proven approach over writing net-new code when it meets the requirement.

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Generate planning docs before coding: PRD, architecture, system_design, tech_doc, task_list
   - Identify dependencies and risks
   - Break down into phases

1.5. **Design Consultation** _(Claude 检测后主动调用，非 hook 级自动化)_
   - 当任务涉及 UI 组件、页面、布局或视觉变更时：
     - Claude 主动调用 `design-consultation` skill
     - Parallel agents: UI Designer + UX Architect + UX Researcher
     - Accessibility gate (WCAG AA)
     - Wait for user confirmation on design brief before coding
   - Skip for backend-only, CLI, or non-visual tasks

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Design Review** _(Claude 检测后主动调用，非 hook 级自动化)_
   - If implementation touched CSS/styling/component files:
     - Claude 主动调用 `design-review` skill before code review
     - Check: design token compliance, accessibility, responsive, visual consistency
     - Fix CRITICAL/HIGH issues before proceeding

4. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

5. **Verify** (`/verify pre-pr`)
   - Build + types + lint + tests + security scan
   - Heavy 模式下，若 `/plan` 定义了 Acceptance Criteria → 触发 `evaluation-loop`（独立 Evaluator 评估）
   - 评分标准见 `evaluation-rubric.md`

6. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format
   - See [git-workflow.md](./git-workflow.md) for commit message format and PR process
