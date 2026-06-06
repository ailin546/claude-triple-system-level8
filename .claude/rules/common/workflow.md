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
   - **一致性不变量检查**（所有模式）：对照项目 CLAUDE.md §八½ 的 5 条不变量逐条确认
   - **Standard+ 模式**：若 `.claude/specify.md` 存在 → 对照验收条件逐条检查（MUST 全过才算通过）
   - **Heavy 模式**：若 `/plan` 定义了 Acceptance Criteria → 触发 `evaluation-loop`（独立 Evaluator 评估）
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

## 记忆系统

### 设计目标

1. 经验教训和遇到的问题**自动记录**到记忆文件
2. 记忆文件**自动流转沉淀**（today → weekly → long-term）
3. **不记录重复和无实质意义的内容**（零噪音）

### 架构总览

```
会话进行中
    │
    ├─ Claude 在对话中输出 **Lessons:** / **Decisions:** 段
    │  （自然表达即可，不需要"记得写记忆"）
    │
    ├─► 每 30 分钟 → periodic-memory.js (PostToolUse hook, 时间门控)
    │   ├─ 提取 transcript 中的 lessons/decisions（共享 extract-lessons.js）
    │   ├─ 写入 today.md（标记 [periodic]）
    │   └─ 保障长期不关闭的 channel 会话（Telegram/Discord）
    │
    ├─► Context Compact → pre-compact.js (PreCompact hook)
    │   ├─ 提取 transcript 中的 lessons/decisions（共享 extract-lessons.js）
    │   ├─ 收集 git commits
    │   ├─ 写入 today.md（标记 [compact]，与 Stop 的 [auto] 区分）
    │   └─ 更新 seen-lessons.json（Stop 时自动跳过已提取的）
    │
    ▼
会话结束 → stop-summary.js (Stop hook, 100% 可靠)
    │
    ├─ 读 transcript JSONL（从 stdin JSON 的 transcript_path 获取）
    │   └─ 严格匹配 **Lessons:** section 下的 → 格式教训
    │   └─ 严格匹配 **Decisions:** section 下的条目
    │   └─ 跳过 seen-lessons.json 中已有的 keys（compact 已提取的不重复）
    │
    ├─ 读 git log（session 期间的 commits）
    │   └─ fix/perf/hotfix 类型提取 commit body 作为上下文
    │
    ├─ 门控判断：commits + lessons + decisions 全为 0？
    │   ├─ 是 → 不记录任何内容（纯聊天/纯阅读/编辑未提交）
    │   └─ 否 → 写入 today.md
    │       ├─ 项目级：PROJECT/.memory/today.md（完整 entry）
    │       └─ 全局级：~/.memory/today.md（仅 lessons + decisions）
    │
    ├─ 轮转：today.md 日期非今日 → 归档到 weekly.md → 重置 today.md
    │
    ├─ 沉淀：weekly.md 超过 2 周的内容 → Lessons/Decisions 提取到 long-term.md
    │   └─ 流水账自动丢弃，只保留有长期价值的内容
    │
    ├─ 推广：promoteLessons() 扫描 **Lessons:** section 下出现 2+ 次的教训 → 写入 CLAUDE.md
    │
    └─ 更新 ~/.memory/index.md（全局项目索引）
```

### 信号源与门控

**什么会被记录（任一触发）：**

| 信号 | 写入位置 | 内容 |
|------|----------|------|
| Git commits（session 期间） | 项目 today.md | commit messages；fix 类型含 body |
| **Lessons:** section 中的 `→` 教训 | 项目 + 全局 today.md | 教训原文（去 markdown 格式） |
| **Decisions:** section 中的条目 | 项目 + 全局 today.md | 决策原文 |

**什么不会被记录：**
- 纯聊天、解释代码（无 commits、无 Lessons/Decisions section）
- 编辑了文件但没 commit（未提交变更不是实质输出）
- 对话中随便出现的 `→` 字符（只在严格匹配的 section header 下才提取）

### 教训的自动提取规则

Claude 只需在分析问题时自然地使用以下格式，Stop hook 会自动提取：

```markdown
**Lessons:**
- 错误描述 → 正确做法
- 另一个问题 -> 解决方案
```

**提取条件（全部满足才提取）：**
1. 必须在 assistant 消息中
2. 必须在 `**Lessons:**` 独占一行的 section header 下
3. 必须是 `- ` 或 `* ` 开头的 bullet 项
4. 必须包含 `→` 或 `->` 或 `-->` 箭头
5. 箭头两侧总长度 >= 15 字符
6. 箭头左侧（问题描述）未在 `seen-lessons.json` 中出现过

**Decisions 提取条件：**
1. 必须在 `**Decisions:**` 独占一行的 section header 下
2. 必须是 bullet 项，长度 >= 10 字符

### 反循环与去重

| 机制 | 作用 | 位置 |
|------|------|------|
| `seen-lessons.json` | 持久化已提取的 lesson keys（7天TTL），防止 transcript 中同一教训反复提取 | `.claude/.session-state/` |
| `lessonKey()` | 取箭头左侧文本做语义去重，"X → A" 和 "X → B" 算同一教训 | 内存中 |
| `cleanLesson()` | 去 markdown 格式（`**bold**` → `bold`），normalize 空白 | 内存中 |
| 时间戳+项目名 | `[auto] HH:MM — 项目名` marker 防同一**分钟+marker**重复写入。**仅防同 marker**——跨触发点/跨 marker（`[auto]` vs `[periodic]`）的 commit 不防，见下行 | today.md 文件中 |
| `filterNewCommits()` | commit 按 short-hash 去重，剔除 today.md 已记录的。防多次 Stop / periodic 触发用 `git log --since=session_start` 全量窗口重复 append（2026-06-05 修：commit 路径此前无去重——lessons 有 seen-lessons 但 commits 无等价机制——weekly 曾 86% 冗余 / 129KB） | `lib/extract-lessons.js` |

**关键设计：反循环不依赖 today.md 内容**。因为 today.md 会被清空/轮转，依赖它做去重会导致教训被重新提取。改用独立的 `seen-lessons.json` 文件。**commit 去重例外**：commit 去重恰恰**读** today.md 已有 hash（filterNewCommits），因为 commit 无 seen-lessons 式独立状态，且 today.md 内的 commit 列表在轮转前就是权威来源。

### 三级流转

```
today.md ──[次日 Stop hook]──→ weekly.md ──[2周后 Stop hook]──→ long-term.md
 当日记录                       近期归档                        永久知识库
 commits + lessons              所有内容                        仅 Lessons + Decisions
```

| 层级 | 触发时机 | 保留内容 | 丢弃内容 |
|------|----------|----------|----------|
| today → weekly | 每日首次 Stop hook（日期变化） | 全部 body | 无（全量归档） |
| weekly → long-term | 每周一次（超过 2 周的 section） | `**Lessons:**` 和 `**Decisions:**` 下的条目 | 流水账、Open Loops、session 记录 |
| long-term → CLAUDE.md | 每日一次（promoteLessons） | 出现 2+ 次的 `→` 教训 | 只出现 1 次的不推广 |

### Claude 主动写入（可选补充）

Stop hook 自动采集是底线保障。Claude 也可以主动写入更丰富的内容：

```markdown
### [Claude Code] HH:MM
- 工作描述（动词开头）
- 重要决策及原因
- 未完成的工作（Open Loops）

**Lessons:**
- 问题描述 → 正确做法

**Decisions:**
- 决策内容及原因
```

**写**：功能开发、bug 修复、决策、Open Loops、经验教训
**不写**：纯问答、用户原始消息、系统标签、无信息量条目

### 设计教训（构建此系统过程中的经验）

**信号源设计：**
- Stop hook 的 stdin 是 JSON 元数据，不是对话内容 → 必须从 `transcript_path` 读 JSONL 文件
- `→` 在中文/代码上下文中太常见 → 不能全局匹配，必须限定在 `**Lessons:**` section header 下
- 未提交的文件变更不是实质输出 → 不应触发记录（"编辑了 139 个文件"是噪音）
- commit 是已完成的工作产物 → 适合作为记录触发信号

**去重设计：**
- 依赖 today.md 内容做反循环会失效 → today.md 被清空/轮转后教训会被重新提取
- 必须用独立状态文件（seen-lessons.json）持久化已提取的 keys
- 同一问题不同表述（"X → A" vs "X → B"）应算同一教训 → 用箭头左侧做 key

**流转设计：**
- 必须先轮转后写入（main 函数中先调 maintainProjectMemory 再调 autoRecordSessionFacts）→ 否则跨日会话会覆盖昨天的数据
- weekly → long-term 只沉淀 Lessons 和 Decisions → 流水账没有长期价值
- 全局 today.md 只写 lessons/decisions → commits 是项目特定内容，不应写入全局

**大文件处理：**
- 长会话的 transcript 可能达 55MB+ → 全量 readFileSync 会爆内存
- 只读最后 10MB 足够覆盖近期对话中的教训

**section 检测：**
- `**Lessons:**` 必须严格匹配独占一行 → 正文中提到 "Lessons" 的句子不能被误判为 section header
- 非 bullet、非空行出现时立即退出 section → 防止后续无关内容被误提取

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
