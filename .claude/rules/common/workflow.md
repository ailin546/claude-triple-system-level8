# Development Workflow

> 统一交付语义：Requirement Confirmation（按条件）→ Plan → Execute → Review → Verify →
> Docs Sync → Summary。Fast 且范围清楚时直接 Execute → Verify → Summary。

## Feature Implementation Workflow

> 以下流程适用于 **Standard+ 模式**。Fast 模式下直接实现并运行最相关验证。

0. **Requirement Confirmation（按条件）**
   - Brownfield、存在多种合理理解或 Heavy 新架构任务，先查 Existing Capabilities。
   - 锁定 Required Delta、Non-goals、Acceptance Checks 和 Change Budget。
   - Heavy 或新增子系统取得用户确认后再实施。

1. **Plan**
   - 只为多步骤任务制定最小可执行计划；不强制生成 PRD、架构文档或 task_list。
   - 规划可由主 agent 完成，默认不派 planner 或 plan reviewer。

2. **Execute**
   - 先查项目内已有实现与测试；仅在 API、版本或外部事实不稳定时查官方资料。
   - 默认做最小充分改动。TDD 是可选技术，不是强制流程；修 bug 优先复现原症状。
   - 实际规模超过 Change Budget 约两倍或出现预算外子系统时，停止扩张并重新确认。

3. **Review**
   - 非平凡或高风险改动按风险审查一次；普通改动可由主 agent 自审。
   - 只有第一次发现 Critical/High 并完成修复后，才允许一次复核；第三次及以后需用户明确要求。

4. **Verify** (`/verify pre-pr`)
   - 选择最小但有意义的 build、types、lint、tests 或安全检查，并对照验收条件。
   - `evaluation-loop` 仅用于有基线、指标、验证命令和守护命令的可度量改进，不由 Heavy 模式自动触发。

5. **Docs Sync / Summary**
   - 只有行为、接口、配置或运维方式改变时同步相关文档。
   - 说明已验证、未验证和剩余风险。

6. **Commit & Push** — 用户要求或任务交付流程包含发布时，见下方 Git Workflow 段。

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
    ├─ 推广：promoteLessons() 扫描 **Lessons:** section 下出现 2+ 次的教训 → 写入 .memory/promoted-lessons.md（2026-08-02 B9 迁出 CLAUDE.md 止增肥）
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
| long-term → promoted-lessons.md | 每日一次（promoteLessons；2026-08-02 前写 CLAUDE.md） | 出现 2+ 次的 `→` 教训 | 只出现 1 次的不推广 |

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
1. 先检查仓库内已有结构和依赖。
2. 只有从零创建较大项目且外部选型会显著影响结果时，才搜索成熟 skeleton。
3. 默认由主 agent 比较少量候选；安全/架构风险高且视角可解耦时才考虑并行评估。
4. 采用外部 skeleton 前确认许可证、维护状态和 Required Delta，避免为小任务引入整套框架。

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
