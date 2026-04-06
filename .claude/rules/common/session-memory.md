# Session Memory — Claude 主动写入

> **[MANDATORY] 有实质工作的会话结束前，必须将摘要写入 `~/.memory/today.md`。**
> stop-summary.js 只处理轮转和元数据，**不会替你写内容**。
> 如果你不写，这次会话的工作就永久丢失。漏写 = 违规。

## 规则

记忆系统分两层：
- **全局记忆** `~/.memory/today.md` — 所有项目的工作内容都写这里
- **项目记忆** `PROJECT/.memory/today.md` — 如果存在，写项目特定的详细内容

## 写入格式

```markdown
### [Claude Code] HH:MM
- 一句话描述做了什么（动词开头）
- 另一件事
- ...
```

## 写入标准

**写**：
- 做了什么（功能开发、bug 修复、配置变更、分析结论）
- 重要决策及原因
- 未完成的工作（Open Loops）

**不写**：
- 纯问答、解释代码（无副作用的会话不需要记录）
- 用户原始消息原文
- `<command-message>`、`<scheduled-task>` 等系统标签
- "Session ended normally" 等无信息量条目

## 触发条件

- 会话中有**文件变更**、**决策**、或**未完成的工作**时必须写
- 纯问答会话（如"解释这段代码"）不需要写
- 定时任务（scheduled tasks）不需要写（hook 会记录文件变更）

## 写入时机

**[MANDATORY] 在用户最后一条消息处理完后，主动写入 `~/.memory/today.md`。**
不要等用户说"记录一下"——主动写。不要等会话结束——处理完最后一条消息就写。

## today.md 结构

```markdown
# Today — YYYY-MM-DD

## Sessions

### [Claude Code] HH:MM
- 工作描述 1
- 工作描述 2

### [Claude Code] HH:MM
- 工作描述 3
```

如果 today.md 不存在或日期不是今天，先创建/重置再写入。

## 全局记忆 (~/.memory/)

跨项目的信息写到 `~/.memory/today.md`：
- 跨项目的架构决策或工具使用习惯
- 用户偏好的变化
- 适用于所有项目的经验教训

项目特定的工作内容**不要**写到全局记忆。

`~/.memory/index.md` 由 hook 自动维护，不需要 Claude 手动更新。
