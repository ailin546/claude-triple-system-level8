# Development Workflow

> 统一的开发流程文件：Research → Plan → TDD → Code Review → Verify → Commit → Session Memory。
> 取代原先的 `development-workflow.md`、`git-workflow.md`、`session-memory.md`、`patterns.md` 四个文件。

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
   - 评分标准见 `~/.claude/on-demand/evaluation-rubric.md`（按需加载，evaluation-loop skill 启动时引入）

6. **Commit & Push** — 见下方 Git Workflow 段

---

## Git Workflow

### Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via `~/.claude/settings.json`.

### Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

---

## Session Memory — Claude 主动写入

### 规则

在**每次有实质工作的会话结束前**，Claude 必须主动将会话摘要写入记忆文件。

记忆系统分两层：
- **项目记忆** `PROJECT/.memory/today.md` — 写当前项目的具体工作内容
- **全局记忆** `~/.memory/today.md` — 写跨项目的洞察、工具使用决策、用户偏好等

stop-summary.js hook 只记录元数据（文件变更、模式升档），不记录对话内容。
会话的实质工作描述必须由 Claude 在对话中完成。

### 写入格式

```markdown
### [Claude Code] HH:MM
- 一句话描述做了什么（动词开头）
- 另一件事
- ...
```

### 写入标准

**写**：
- 做了什么（功能开发、bug 修复、配置变更、分析结论）
- 重要决策及原因
- 未完成的工作（Open Loops）

**不写**：
- 纯问答、解释代码（无副作用的会话不需要记录）
- 用户原始消息原文
- `<command-message>`、`<scheduled-task>` 等系统标签
- "Session ended normally" 等无信息量条目

### 触发条件

- 会话中有**文件变更**、**决策**、或**未完成的工作**时必须写
- 纯问答会话（如"解释这段代码"）不需要写
- 定时任务（scheduled tasks）不需要写（hook 会记录文件变更）

### 写入时机

在用户最后一条消息处理完后、会话即将结束时写入。
不要等用户说"记录一下"——主动写。

### today.md 结构

```markdown
# Today — YYYY-MM-DD

## Sessions

### [Claude Code] HH:MM
- 工作描述 1
- 工作描述 2
```

如果 today.md 不存在或日期不是今天，先创建/重置再写入。

### 全局记忆 (~/.memory/)

跨项目的信息写到 `~/.memory/today.md`：
- 跨项目的架构决策或工具使用习惯
- 用户偏好的变化
- 适用于所有项目的经验教训

项目特定的工作内容**不要**写到全局记忆。

`~/.memory/index.md` 由 hook 自动维护，不需要 Claude 手动更新。

---

## Common Patterns

### Skeleton Projects

When implementing new functionality:
1. Search for battle-tested skeleton projects
2. Use parallel agents to evaluate options:
   - Security assessment
   - Extensibility analysis
   - Relevance scoring
   - Implementation planning
3. Clone best match as foundation
4. Iterate within proven structure

### Design Patterns

**Repository Pattern** — Encapsulate data access behind a consistent interface:
- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details (database, API, file, etc.)
- Business logic depends on the abstract interface, not the storage mechanism
- Enables easy swapping of data sources and simplifies testing with mocks

**API Response Format** — Use a consistent envelope for all API responses:
- Include a success/status indicator
- Include the data payload (nullable on error)
- Include an error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)
