# Shared State 设计

## 目标

把 shared-state 从“概念上的协作层”升级成“最小可用且可靠的控制面”，只服务 Heavy 模式。

## 适用范围

仅在以下场景启用：

- 多 agent 并行
- 跨会话 handoff
- worktree / tmux 协同
- 长任务拆分执行

单 agent 小任务禁止启用 shared-state。

## 最小模型

shared-state 至少包含：

1. `board.json`
   - 任务板
   - worker 状态
   - 文件 claim
   - workflow 状态

2. `decisions.log`
   - 记录阶段性关键决策

3. `handoff-template.md`
   - 统一交接模板

4. `schema.json`
   - 明确 version 与字段约束

## board.json 建议结构

```json
{
  "version": 1,
  "workflow_id": "auth-refactor-2026-03-25",
  "mode": "Heavy",
  "tasks": [
    {
      "task_id": "T1",
      "title": "设计权限模型",
      "owner": "planner",
      "status": "in_progress",
      "depends_on": [],
      "files_claimed": ["docs/permissions.md"],
      "updated_at": "2026-03-25T13:00:00Z",
      "handoff_note": ""
    }
  ],
  "workers": [
    {
      "agent_id": "planner-1",
      "role": "planner",
      "lease_until": "2026-03-25T13:30:00Z",
      "last_heartbeat": "2026-03-25T13:05:00Z",
      "status": "active"
    }
  ]
}
```

## 并发安全要求

必须补齐以下能力：

1. 原子写入
2. schema version
3. lease / heartbeat
4. stale worker 清理
5. file claim 冲突检测
6. handoff 完整性检查

## 文件 claim 规则

### 可直接 claim

- 文档文件
- 独立模块文件
- 彼此无重叠的工作区块

### 需要升级处理

- 多个 agent 同时写同一文件
- 修改 shared-state 自身实现
- 修改核心规则文件

升级处理：

- 由协调者重新切分任务
- 或切回单 agent 串行处理

## handoff 模板

每次交接至少包含：

```text
任务
已完成内容
变更文件
当前结论
未决问题
下一步建议
风险
```

## 失败与降级

以下情况立即退出协作模式：

- board 写入失败
- schema 不兼容
- heartbeat 连续超时
- 同一文件 claim 冲突无法解决

降级动作：

1. 冻结 board 更新
2. 标记所有 worker 为 `degraded`
3. 汇总最近 handoff
4. 转回单 agent 模式继续

## 设计原则

1. shared-state 是协调层，不是业务层。
2. 它必须比普通工作流更可靠，否则不如不用。
3. 任何时候都不能假装“协同正常”。
