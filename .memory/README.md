# AI Shared Memory / AI 共享记忆

[中文](#中文) | [English](#english)

---

<a id="中文"></a>

## 中文

这是一个**跨 AI 工具、跨设备**的共享记忆仓库。所有 AI 编程助手（Claude Code、Codex、Cursor、Windsurf 等）通过读写本仓库中的文件来共享工作上下文，避免重复劳动。

### 给 AI 的指令

> **如果你是 AI 助手，请严格遵守以下协议。**

#### 会话开始时：读取记忆

按以下顺序读取文件，了解当前项目上下文：

```
1. long-term.md   ← 永久知识：架构决策、核心约定、经验教训
2. weekly.md      ← 本周摘要：近期进展和待办
3. today.md       ← 今日日志：今天其他工具/会话已完成的工作
```

#### 会话结束时：写入记忆

在 `today.md` 的 `## Sessions` 区域末尾**追加**一个段落：

```markdown
### [你的工具名] HH:MM
**Decisions:**
- 选择了 X 方案而非 Y，因为...（关键决策）
**Constraints:**
- 发现 Z 限制...（技术/业务约束）
**Open loops:**
- 还需要完成...（未完成的事项）
```

**工具名**使用固定标签：`Claude Code`、`Codex`、`Cursor`、`Windsurf`、`Copilot`

#### 写入规则

| 规则 | 说明 |
|------|------|
| **只追加** | 在文件末尾添加，不修改或删除其他工具的条目 |
| **只记高价值信息** | 决策（为什么选 A 不选 B）、约束（发现的限制）、未完成项 |
| **禁止流水账** | 不要写"读了文件"、"开始工作"、"修改了 3 个文件"等噪音 |
| **禁止代码片段** | 用文件路径引用，不要粘贴代码到记忆文件中 |
| **禁止敏感信息** | 不要写入密钥、密码、token 等 |

#### Git 同步（如果 `.git/` 存在）

如果本目录是 git 仓库，在写入记忆后执行同步：

```bash
cd .memory
git add -A
git commit -m "memory: $(date +%Y-%m-%d) [你的工具名]"
git pull --rebase origin main || (git rebase --abort && git pull origin main)
git push origin main
```

如果推送失败（网络问题），跳过即可，下次会话会自动重试。

### 文件格式

#### today.md

```markdown
# Today — 2026-03-28

## Sessions

### [Claude Code] 14:30
**Decisions:**
- 选择方案 A：用 git submodule 而非复制文件，因为需要版本追踪

### [Codex] 15:20
**Decisions:**
- API 改用 REST 而非 GraphQL，因为客户端简单
**Open loops:**
- 用户认证模块还需要集成测试

### [Cursor] 16:45
**Constraints:**
- 发现 Node 18 不支持某 API，需要 Node 20+
```

#### weekly.md

```markdown
# Weekly Summary — 2026-W13

## 2026-03-25 (Tue)
**Decisions:**
- 项目初始化，选择 Next.js 15 + Supabase
**Open loops:**
- CI/CD 还未配置

## 2026-03-26 (Wed)
**Decisions:**
- 数据库 schema 确定，使用 Drizzle ORM
```

#### long-term.md

```markdown
# Long-Term Knowledge

## 架构决策
- 前端 Next.js 15 App Router + Tailwind
- 后端 Supabase（Auth + DB + Realtime）
- ORM: Drizzle（类型安全）

## 经验教训
- Hook 失败必须优雅降级，不阻塞主流程
- 两个 CLAUDE.md 必须同步修改

## 核心约定
- 文件不超过 800 行
- 函数不超过 50 行
- 不可变数据优先
```

### 自动归档流程

```
today.md ──(次日)──→ weekly.md ──(2周后)──→ long-term.md
   │                     │                       │
   │  当日工作日志        │  按日期归档摘要        │  永久知识库
   │  次日自动清空重置    │  保留最近 2 周         │  手动或自动沉淀
```

- **today → weekly**：每天首次会话启动时，如果 today.md 的日期不是今天，自动归档到 weekly.md 并重置
- **weekly → long-term**：超过 2 周的条目中，Decisions 和 Lessons 沉淀到 long-term.md

### 各工具配置方法

#### Claude Code

如果项目已集成 [claude-triple-system-level8](https://github.com/ailin546/claude-triple-system-level8)，读写和同步全自动，无需额外配置。

否则，在项目的 `CLAUDE.md` 中添加：

```markdown
## 共享记忆
每次会话开始，按顺序读取 .memory/long-term.md → weekly.md → today.md。
每次会话结束，在 .memory/today.md 的 ## Sessions 下追加摘要。
格式：### [Claude Code] HH:MM，然后列出 Decisions/Constraints/Open loops。
只记录高价值信息，禁止流水账。
```

#### Codex

在 Codex 的 instructions 中添加：

```
## 共享记忆协议
每次会话开始，读取以下文件了解上下文：
1. .memory/long-term.md — 永久知识
2. .memory/weekly.md — 本周摘要
3. .memory/today.md — 今日工作

每次会话结束前，在 .memory/today.md 的 ## Sessions 下追加：
### [Codex] HH:MM
**Decisions:**
- 关键决策
**Open loops:**
- 未完成事项

如果 .memory/.git 存在，结束前执行：
cd .memory && git add -A && git commit -m "memory: $(date +%Y-%m-%d) [Codex]" && git pull --rebase origin main && git push origin main
```

#### Cursor

在 `.cursor/rules` 或 `.cursorrules` 中添加：

```
## 共享记忆
每次对话开始先读取 .memory/long-term.md、.memory/weekly.md、.memory/today.md。
每次对话结束在 .memory/today.md 的 ## Sessions 下追加：
### [Cursor] HH:MM
**Decisions:**
- 关键决策
如果 .memory/.git 存在，结束前执行 git 同步：
cd .memory && git add -A && git commit -m "memory: [Cursor]" && git pull --rebase origin main && git push origin main
```

#### Windsurf

在 `.windsurfrules` 中添加与 Cursor 相同的内容，将 `[Cursor]` 替换为 `[Windsurf]`。

#### OpenClaw

在 `.openclawrules` 中添加与 Cursor 相同的内容，将 `[Cursor]` 替换为 `[OpenClaw]`。

#### 其他工具

在该工具的项目级配置文件中添加：

```
每次会话开始读取 .memory/ 下的 long-term.md、weekly.md、today.md。
会话结束前在 today.md 的 ## Sessions 下追加 ### [工具名] HH:MM 格式的摘要。
只记录 Decisions（决策）、Constraints（约束）、Open loops（待办）。
如果 .memory/.git 存在，结束前执行 git add/commit/pull/push 同步。
```

### 多设备设置

```bash
# 设备 A（首次初始化）
cd your-project
git clone git@github.com:你的用户名/claude-memory.git .memory

# 设备 B（克隆同一仓库）
cd your-project
git clone git@github.com:你的用户名/claude-memory.git .memory

# 之后自动同步：各设备的 AI 工具会话结束时自动 push，启动时自动 pull
```

### 冲突处理

记忆文件采用 append-only 设计（每个工具追加独立段落），git auto-merge 几乎不会冲突。

万一冲突：
1. `git pull --rebase` 优先
2. rebase 失败 → `git rebase --abort && git pull`（merge 模式，保留双方内容）
3. 仍然失败 → 跳过本次同步，下次重试

---

<a id="english"></a>

## English

This is a **cross-AI-tool, cross-device** shared memory repository. All AI coding assistants (Claude Code, Codex, Cursor, Windsurf, etc.) read and write files in this repo to share work context and avoid duplicate effort.

### Instructions for AI

> **If you are an AI assistant, follow this protocol strictly.**

#### On session start: Read memory

Read files in this order to understand the current project context:

```
1. long-term.md   ← Permanent knowledge: architecture decisions, conventions, lessons
2. weekly.md      ← This week's summary: recent progress and todos
3. today.md       ← Today's log: work completed by other tools/sessions today
```

#### On session end: Write memory

**Append** a paragraph at the end of the `## Sessions` section in `today.md`:

```markdown
### [Your Tool Name] HH:MM
**Decisions:**
- Chose approach X over Y because... (key decisions)
**Constraints:**
- Discovered limitation Z... (technical/business constraints)
**Open loops:**
- Still need to... (unfinished items)
```

**Tool names** use fixed labels: `Claude Code`, `Codex`, `Cursor`, `Windsurf`, `Copilot`

#### Writing rules

| Rule | Description |
|------|-------------|
| **Append only** | Add at the end, never modify or delete other tools' entries |
| **High-value only** | Decisions (why A not B), constraints (limitations found), open items |
| **No noise** | Don't write "read files", "started working", "modified 3 files" |
| **No code snippets** | Reference by file path, don't paste code into memory files |
| **No secrets** | Never write API keys, passwords, tokens, etc. |

#### Git sync (if `.git/` exists)

If this directory is a git repo, sync after writing:

```bash
cd .memory
git add -A
git commit -m "memory: $(date +%Y-%m-%d) [Your Tool Name]"
git pull --rebase origin main || (git rebase --abort && git pull origin main)
git push origin main
```

If push fails (network issues), skip it — next session will retry automatically.

### File formats

#### today.md

```markdown
# Today — 2026-03-28

## Sessions

### [Claude Code] 14:30
**Decisions:**
- Chose plan A: git submodule over file copy for version tracking

### [Codex] 15:20
**Decisions:**
- Switched API to REST over GraphQL for client simplicity
**Open loops:**
- Auth module still needs integration tests
```

#### weekly.md

```markdown
# Weekly Summary — 2026-W13

## 2026-03-25 (Tue)
**Decisions:**
- Project init: Next.js 15 + Supabase

## 2026-03-26 (Wed)
**Decisions:**
- DB schema finalized, using Drizzle ORM
```

#### long-term.md

```markdown
# Long-Term Knowledge

## Architecture Decisions
- Frontend: Next.js 15 App Router + Tailwind
- Backend: Supabase (Auth + DB + Realtime)
- ORM: Drizzle (type-safe)

## Lessons Learned
- Hook failures must degrade gracefully, never block main flow
```

### Auto-archival flow

```
today.md ──(next day)──→ weekly.md ──(2 weeks)──→ long-term.md
```

- **today → weekly**: On first session of a new day, auto-archive and reset
- **weekly → long-term**: Entries older than 2 weeks — Decisions and Lessons sink to long-term.md

### Tool-specific setup

#### Claude Code

If the project uses [claude-triple-system-level8](https://github.com/ailin546/claude-triple-system-level8), everything is automatic.

Otherwise, add to `CLAUDE.md`:

```markdown
## Shared Memory
On session start, read .memory/long-term.md → weekly.md → today.md in order.
On session end, append summary to .memory/today.md under ## Sessions.
Format: ### [Claude Code] HH:MM, then list Decisions/Constraints/Open loops.
High-value info only, no noise.
```

#### Codex

Add to Codex instructions:

```
## Shared Memory Protocol
On session start, read: .memory/long-term.md, .memory/weekly.md, .memory/today.md
On session end, append to .memory/today.md under ## Sessions:
### [Codex] HH:MM
**Decisions:** - key decisions
**Open loops:** - unfinished items
If .memory/.git exists, run: cd .memory && git add -A && git commit -m "memory: [Codex]" && git pull --rebase origin main && git push origin main
```

#### Cursor

Add to `.cursor/rules` or `.cursorrules`:

```
## Shared Memory
On conversation start, read .memory/long-term.md, weekly.md, today.md.
On conversation end, append to .memory/today.md under ## Sessions:
### [Cursor] HH:MM
**Decisions:** - key decisions
If .memory/.git exists, sync: cd .memory && git add -A && git commit -m "memory: [Cursor]" && git pull --rebase origin main && git push origin main
```

#### Windsurf / OpenClaw

Same as Cursor config above, replace `[Cursor]` with `[Windsurf]` or `[OpenClaw]` respectively.
Config files: `.windsurfrules` for Windsurf, `.openclawrules` for OpenClaw.

#### Other tools

Add to the tool's project config:

```
On session start, read .memory/long-term.md, weekly.md, today.md.
On session end, append ### [ToolName] HH:MM summary to today.md under ## Sessions.
Record only Decisions, Constraints, Open loops.
If .memory/.git exists, run git add/commit/pull/push to sync.
```

### Multi-device setup

```bash
# Device A (first time)
cd your-project
git clone git@github.com:yourname/claude-memory.git .memory

# Device B (same repo)
cd your-project
git clone git@github.com:yourname/claude-memory.git .memory

# Auto-sync: each tool pushes on session end, pulls on session start
```

### Conflict handling

Memory files use append-only design (each tool appends independent paragraphs), so git auto-merge almost never conflicts.

If conflict occurs:
1. `git pull --rebase` first
2. Rebase fails → `git rebase --abort && git pull` (merge mode, keep both sides)
3. Still fails → skip this sync, retry next session
