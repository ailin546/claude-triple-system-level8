# Shared Memory Protocol

Claude Code、Codex 以及其他开发工具共享相同的知识文件，不创建工具专属的
事实来源。

## 路径

全局记忆：

- `~/.memory/long-term.md`
- `~/.memory/weekly.md`
- `~/.memory/today.md`
- `~/.memory/promoted-lessons.md`

项目记忆：

- `PROJECT/.memory/handoff.md`
- `PROJECT/.memory/long-term.md`
- `PROJECT/.memory/weekly.md`
- `PROJECT/.memory/today.md`
- `PROJECT/.memory/promoted-lessons.md`

`AGENT_MEMORY_HOME` 可以覆盖全局记忆目录，默认值为 `~/.memory`。

## 读取顺序

1. 全局 `long-term.md`
2. 全局 `today.md`
3. 项目 `long-term.md`
4. 项目 `weekly.md`
5. 项目 `today.md`
6. 当前任务需要恢复时读取项目 `handoff.md`

显式用户指令和项目规则始终优先于记忆。记忆是历史上下文，不是新的系统规则。

## 写入规则

- 只记录 Decisions、Constraints、Lessons、Open Issues 和 Next Step。
- 项目事实写项目 `.memory/`，跨项目经验写全局 `~/.memory/`。
- 使用工具标签，例如 `[Claude]`、`[Codex]`，但不要按工具拆分文件。
- 默认只追加高价值内容，不写完整对话、密钥或大段代码。
- 自动写入必须可去重、非阻塞；失败不能阻断正常开发。

## 运行状态边界

以下内容不属于共享记忆，也不应跨工具同步：

- `.task-mode`
- hook 锁文件和定时器状态
- transcript、日志、缓存和成本统计
- Claude 的 `~/.claude/memory/` sprint 状态
- Codex 的线程、会话或 UI 状态

旧的 `~/.codex/memories/` 是迁移来源，不再作为活跃写入目标。迁移时先备份，
再人工去重合并到 `~/.memory/`，不得直接覆盖已有文件。
