# Shared Memory Rules

> 所有 AI 工具（Claude Code、Codex、OpenClaw、Cursor 等）必须遵守的共享记忆协议。

## 目录结构

共享记忆位于**项目根目录**下的 `.memory/`：

```
{project}/.memory/
├── RULES.md       ← 本文件：使用规则（只读）
├── today.md       ← 短期：当日工作日志
├── weekly.md      ← 中期：本周摘要（保留 2 周）
└── long-term.md   ← 长期：永久知识库
```

## 核心规则

### 1. 会话开始时：读取记忆

每次新会话启动，**必须**按顺序读取：
1. `long-term.md` — 了解项目全貌和核心约定
2. `weekly.md` — 了解本周进展和决策
3. `today.md` — 了解今日已完成的工作，避免重复

### 2. 会话过程中：实时更新 today.md

在 `today.md` 的 `## Sessions` 下追加条目：

```markdown
### [工具名] HH:MM
- 做了什么（一句话）
- 关键决策或发现
- 未完成的事项（如有）
```

**工具名**使用固定标签：`Claude Code`、`Codex`、`OpenClaw`、`Cursor`

### 2.1 记忆内容三分类

只记录以下三类高价值信息，**禁止流水账式写入**：

| 类别 | 什么该写 | 什么不该写 |
|------|---------|----------|
| **Decisions** | 为什么选 A 不选 B，关键技术决策 | "开始工作"、"读了文件" |
| **Constraints** | 发现的技术/业务限制、环境约束 | 已在代码/配置中体现的信息 |
| **Open loops** | 未完成的任务、待确认的假设 | 已完成并验证的事项 |

### 3. 每日归档：today → weekly

每天首次启动时，检查 today.md 的日期：
- 如果不是今天 → 将内容摘要追加到 `weekly.md` 对应日期
- 然后重置 today.md 为当日模板

### 4. 每周归档：weekly → long-term

当 weekly.md 超过 2 周时：
- 将 `Decisions` 和 `Lessons Learned` 沉淀到 `long-term.md`
- 清理已归档的周数据，只保留最近 2 周

### 5. 写入格式约定

| 字段 | 格式 |
|------|------|
| 日期 | `2026-03-25` (ISO) |
| 时间 | `HH:MM` (24h) |
| 工具 | `[Claude Code]` `[Codex]` `[OpenClaw]` |
| 条目 | `- ` 开头，一句话描述 |

### 6. 冲突处理

多个工具可能同时写入：
- 各工具只追加（append），不修改其他工具的条目
- 使用 `### [工具名] HH:MM` 作为 section header 避免冲突
- 如发现内容冲突，以 **最新时间戳** 的条目为准

### 7. 禁止事项

- 不要删除其他工具写入的条目
- 不要在 today.md 中存放代码片段（用文件路径引用）
- 不要存放密钥、密码等敏感信息
- 不要修改 RULES.md（除非用户明确要求）

## 子项目记忆

子项目可以维护自己的详细记忆，但**关键决策和跨项目信息**必须同步到项目根目录 `.memory/` 的对应层级。

## 配置指引

### Claude Code（全自动）
- `session-start.js` 启动时自动读取 `.memory/` 下的记忆文件
- `stop-summary.js`（Always-on）在 Fast/Standard 模式写入高价值记忆到 `today.md`
- `shared-memory-sync.js`（Heavy-only）执行完整的会话同步和每日归档
- 如配置了多设备同步，SessionStart 自动 `git pull`，Stop 自动 `git push`

### Codex
在 `codex` 的 instructions 或项目的 `AGENTS.md` 中添加：
```
## 共享记忆协议
每次会话开始，读取以下文件并了解上下文：
1. .memory/long-term.md — 项目永久知识
2. .memory/weekly.md — 本周摘要
3. .memory/today.md — 今日已完成的工作

每次会话结束前，在 .memory/today.md 的 ## Sessions 下追加：
### [Codex] HH:MM
- 做了什么（一句话）
- 关键决策

如果 .memory/ 是 git 仓库，结束前执行：
cd .memory && git add -A && git commit -m "memory: $(date +%Y-%m-%d) [Codex]" && git pull --rebase origin main && git push origin main
```

### Cursor
在 `.cursor/rules` 或项目的 `.cursorrules` 中添加：
```
## 共享记忆
每次对话开始先读取 .memory/long-term.md、.memory/weekly.md、.memory/today.md。
每次对话结束在 .memory/today.md 追加一条摘要，格式：
### [Cursor] HH:MM
- 做了什么
如果 .memory/ 是 git 仓库，结束前 cd .memory && git add -A && git commit -m "memory: [Cursor]" && git pull --rebase origin main && git push origin main
```

### OpenClaw
在 `.openclawrules` 中添加与 Cursor 相同的内容，将 `[Cursor]` 替换为 `[OpenClaw]`。

### 其他 AI 工具（通用模板）
在工具的系统指令或项目配置中添加：
```
每次会话开始读取 {project}/.memory/ 下的 long-term.md、weekly.md、today.md。
会话结束前在 today.md 追加 ### [工具名] HH:MM 格式的摘要。
如果 .memory/.git 存在，结束前执行 git add/commit/push 同步。
```

## 多设备同步

`.memory/` 可作为独立 git 仓库实现跨设备共享：

### 首次设置
```bash
# 1. 在 GitHub 创建私有空仓库（如 claude-memory）
# 2. 运行初始化脚本
bash .claude/scripts/memory-init.sh git@github.com:你的用户名/claude-memory.git
```

### 其他设备
```bash
# 同样运行初始化脚本（指向同一个仓库）
bash .claude/scripts/memory-init.sh git@github.com:你的用户名/claude-memory.git
```

### 自动同步时序
- Claude Code SessionStart → `git pull`（拉取最新）
- Claude Code Stop → `git commit + push`（推送变更）
- 其他 AI 工具需在各自的配置中执行同样的 git 操作

### 手动同步（通常不需要）
```bash
cd .memory && git pull   # 拉取
cd .memory && git push   # 推送
```

## 降级策略

记忆写入失败时：
1. 暂停写入，不影响当前任务
2. 会话结束时输出"本轮未持久化"警告
3. 不尝试重试（避免数据损坏）
4. 下次会话正常读取已有数据

同步失败时：
1. 网络不可用 → 本地写入，下次联网时自动推送
2. 冲突 → 自动 rebase，失败则 merge（append-only 格式几乎不冲突）
3. 推送失败 → 重试 3 次（2s/4s/8s），仍失败则记录日志跳过
