---
name: "handoff-memory"
description: "用于需要持久交接或记忆沉淀时：记录当前目标、已完成内容、关键决策、未决风险和下一步恢复点，方便跨会话继续工作。"
---

# Handoff Memory

这个技能负责交接和记忆沉淀。

## 适用场景

- 长任务暂停
- 跨会话恢复
- 需要把上下文交给后续 agent
- 任务结束后要保留 lessons / decisions / risks

## 交接模板

优先记录以下字段：

- `Task`
- `Done`
- `Files`
- `Decisions`
- `Open Issues`
- `Next Step`
- `Risks`

## Lesson 模板

高价值经验用下面格式：

- `问题或误区 -> 正确做法`

例子：

- `只修调用侧导致同类 bug 反复出现 -> 应回到公共转换层修根因`

## 记录原则

- 只记录对未来有用的信息
- 不写流水账
- 不重复已有稳定规则
- 优先记录“为什么这样做”

## 推荐落点

全局层：

- `~/.memory/long-term.md`
- `~/.memory/weekly.md`
- `~/.memory/today.md`

项目层：

- `PROJECT/.memory/handoff.md`
- `PROJECT/.memory/today.md`
- `PROJECT/.memory/weekly.md`
- `PROJECT/.memory/long-term.md`

Claude 和 Codex 必须读写这些相同路径，不再分别维护工具专属记忆副本。
如果相关文件不存在，可以按需创建最小结构。旧的 `~/.codex/memories/`
只作为迁移来源保留，不再写入。
