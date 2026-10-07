# Shared Memory Protocol

Claude Code、Codex 以及其他开发工具共享相同的知识文件，不创建工具专属的
事实来源。

## 路径

全局记忆（跨项目，手写）：

- `~/.memory/long-term.md` —— 跨项目教训与决策的唯一的家
- `~/.memory/today.md`、`weekly.md`、`promoted-lessons.md` —— 2026-10-07 起冻结归档，只读

项目记忆：

- `PROJECT/.memory/auto/MEMORY.md` 与同目录的主题文件 —— 项目 Lessons / Decisions /
  工作偏好的唯一的家。Claude Code 用原生 auto memory 读写它（每台机器在项目
  `.claude/settings.local.json` 里把 `autoMemoryDirectory` 指向该目录）；Codex 按本协议
  读写同一目录
- `PROJECT/.memory/handoff.md` 与其它手写 `*.md` —— 任务交接与专题记录
- `PROJECT/.memory/long-term.md`、`weekly.md`、`today.md`、`promoted-lessons.md` ——
  2026-10-07 起冻结归档，只读。原三级轮转（today → weekly → long-term → promoted）
  与写入它们的 hook 已退役

`PROJECT` 是当前目录所在 git 仓库**主 checkout** 的根目录：linked worktree 与子目录
共用这一份，不各自新建；当前目录落在某个 `.memory/` 内部时先退到它的上层；不在 git
里时就是当前目录。实现：Claude `scripts/lib/project-root.js::getProjectMemoryDir()`，
Codex `codex-global-hook.py::get_project_memory_root()`，两者必须解析到同一目录。

`AGENT_MEMORY_HOME` 可以覆盖全局记忆目录，默认值为 `~/.memory`。

## 读取顺序

1. 全局 `~/.memory/long-term.md`
2. 项目 `auto/MEMORY.md`（索引。Claude 自动加载前 200 行 / 25KB，主题文件按需读）
3. 当前任务需要恢复时读取项目 `handoff.md`

显式用户指令和项目规则始终优先于记忆。记忆是历史上下文，不是新的系统规则。

## 写入规则

- `auto/MEMORY.md` 一条记忆一行：`- [标题](文件.md) — 一句话`，每行 ≤ 160 字节；
  细节写主题文件（frontmatter：`name` / `description` / `type`）。
- Codex 只追加主题文件与索引行，并打 `[Codex]` 标签；不重排、不删除别人的行。
  索引逼近 200 行或 25KB 时由 Claude 整理（合并、压描述、迁细节）。
- 项目事实写项目 `auto/`，跨项目经验写全局 `long-term.md`，带工具标签 `[Claude]` / `[Codex]`，
  但不要按工具拆分文件。
- 只记录 Decisions、Constraints、Lessons、Open Issues 和 Next Step；不写完整对话、密钥
  或大段代码。
- 同步只经 quant-deploy `scripts/push-all.sh` / `pull-all.sh`：发布前只允许 `.md` 脏文件、
  拒绝未解决冲突标记；拉取冲突即停、保留两侧交人工。不再有 hook 自动推拉。

## 运行状态边界

以下内容不属于共享记忆，也不应跨工具同步：

- hook 锁文件和定时器状态
- transcript、日志、缓存和成本统计
- Codex 的线程、会话或 UI 状态

旧的 `~/.codex/memories/` 是迁移来源，不再作为活跃写入目标。迁移时先备份，
再人工去重合并到 `~/.memory/`，不得直接覆盖已有文件。
