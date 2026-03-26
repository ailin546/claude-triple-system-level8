# Shared Memory Rules

> 所有 AI 工具（Claude Code、Codex、OpenClaw、Cursor 等）必须遵守的共享记忆协议。

## 目录结构

```
~/cc/.memory/
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

子项目可以维护自己的详细记忆（如 `aimm_qun/AIGMM_Memory.md`），但**关键决策和跨项目信息**必须同步到 `~/cc/.memory/` 的对应层级。

## 配置指引

### Claude Code
在 CLAUDE.md 中添加读取指令，Stop Hook 自动写入 today.md。

### Codex
在 `codex.md` 或 `AGENTS.md` 中添加：
```
每次会话开始先读取 ~/cc/.memory/ 下的 RULES.md、long-term.md、weekly.md、today.md。
会话结束前更新 today.md。
```

### OpenClaw
在各 workspace 的 SOUL.md 或 IDENTITY.md 中添加：
```
共享记忆路径：~/cc/.memory/
遵守 RULES.md 协议读写。
```

## 降级策略

记忆写入失败时：
1. 暂停写入，不影响当前任务
2. 会话结束时输出"本轮未持久化"警告
3. 不尝试重试（避免数据损坏）
4. 下次会话正常读取已有数据
