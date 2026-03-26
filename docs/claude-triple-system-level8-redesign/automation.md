# 自动化策略

## 目标

只自动化那些“几乎总是值得做”的动作，把高成本动作留给明确场景。

## 自动化分层

### Always-on 自动化

这些动作默认对所有任务启用：

1. `session-start`
   - 读取最近一次会话摘要
   - 检测项目类型与包管理器
   - 读取本地规则与轻量记忆

2. `task-router`
   - 判断 `Fast / Standard / Heavy`
   - 输出模式摘要
   - 识别是否需要建议手动命令

3. `post-edit-light`
   - 仅针对被改动文件执行
   - 轻量格式化
   - 显而易见的风险扫描
   - 可选局部语法/类型提醒

4. `stop-summary`
   - 仅在有有效工作产出时写入
   - 记录决策、约束、Open loops

### Standard 自动化

仅在 `Standard / Heavy` 模式启用：

1. `risk-escalation`
   - 发现高风险关键词或目录时提醒升档
   - 提醒是否需要 `/plan`、`/verify`、`/code-review`

2. `quality-gate-light`
   - 局部 lint
   - 局部 typecheck
   - 与当前任务强相关的小范围测试

### Heavy 自动化

仅在 `Heavy` 模式启用：

1. `shared-state-sync`
   - 同步任务板
   - 清理 stale workers
   - 维护 handoff 状态

2. `sprint-memory`
   - 记录跨会话目标、当前阶段、阻塞项

3. `verification-gate-heavy`
   - 扩大的验证命令集
   - 更严格的风险检查

## 不应自动化的事项

以下动作保留手动调用：

- 全量测试
- 全量 build
- 全量 code review
- 多 agent 编排
- session 保存与恢复
- 依赖安装
- push / deploy / publish

原因：

- 成本高
- 噪音大
- 成功率依赖任务上下文
- 误触发会显著影响节奏

## 自动化触发条件表

| 触发器 | Fast | Standard | Heavy |
|---|---|---|---|
| SessionStart | 开 | 开 | 开 |
| Task Router | 开 | 开 | 开 |
| 轻量格式化 | 开 | 开 | 开 |
| 局部风险扫描 | 开 | 开 | 开 |
| 局部质量门 | 关 | 开 | 开 |
| Shared State Sync | 关 | 关 | 开 |
| Sprint Memory | 关 | 关 | 开 |
| 严格验证门 | 关 | 关 | 开 |

## 自动化失败策略

### 轻量自动化失败

比如格式化器异常、局部检查超时：

- 记录 warning
- 不阻塞主工作流
- 允许继续执行

### 重型自动化失败

比如 shared-state 冲突、memory 写入失败：

- 停止相关自动化子系统
- 降级到单 agent 模式
- 输出明确告警
- 禁止假装仍在协同

## 日志与可观测性

每个自动化模块都应有统一输出：

- `hook_name`
- `mode`
- `trigger`
- `duration_ms`
- `result`
- `degraded`
- `message`

示例：

```json
{
  "hook_name": "task-router",
  "mode": "Standard",
  "trigger": "session_start",
  "duration_ms": 12,
  "result": "ok",
  "degraded": false,
  "message": "Cross-file change detected; recommend /plan"
}
```

## 自动化边界总原则

1. 自动化负责提速，不负责替用户做所有决策。
2. 自动化负责暴露风险，不负责掩盖失败。
3. 自动化只做低争议动作。
4. 一旦自动化无法稳定工作，优先降级而不是硬撑。
