# Shared State — 多 Agent 协调控制面

> **仅在 Heavy 模式启用。** 单 agent 任务禁止使用 shared-state。
> 详细设计见 `docs/claude-triple-system-level8-redesign/shared-state.md`。

## 文件清单

| 文件 | 用途 | 访问模式 |
|------|------|---------|
| `board.json` | 任务板、worker 状态、文件 claim | 读-改-写 + version check |
| `schema.json` | 字段约束定义 | 只读 |
| `decisions.log` | Append-only 决策审计日志 | 只追加，不修改 |
| `handoff-template.md` | 统一交接模板 | 只读模板 |
| `artifacts/` | Agent 输出产物 | 生产者写，消费者读 |

## board.json Schema (v1)

```json
{
  "version": 1,
  "workflow_id": "string | null",
  "mode": "Heavy",
  "tasks": [{ "task_id", "title", "owner", "status", "depends_on", "files_claimed", "updated_at", "handoff_note" }],
  "workers": [{ "agent_id", "role", "lease_until", "last_heartbeat", "status" }]
}
```

## 并发规则

1. **原子写入**：读取 → 修改 → 写入临时文件 → rename（避免并发损坏）
2. **Version check**：写入前校验 `version` 字段，不兼容则拒绝
3. **Heartbeat**：每个 worker 定期更新 `last_heartbeat`，超过 30 分钟无心跳视为 stale
4. **Stale 清理**：Stop hook 自动清理 stale worker，释放其 file claim
5. **File claim 冲突**：同一文件被多个 worker claim 时，升级到协调者处理或回退单 agent

## 降级条件

以下情况立即退出协作模式：

- board.json 写入失败
- schema version 不兼容
- heartbeat 连续超时
- file claim 冲突无法解决

**降级动作**：
1. 冻结 board 更新
2. 标记所有 worker 为 `degraded`
3. 汇总最近 handoff
4. 输出 `[降级] 已退回单 agent 模式`

## decisions.log 格式

```
[ISO-8601] [agent-id] [ACTION] 决策内容 — 原因
```

示例：
```
[2026-03-25T13:00:00Z] [planner-1] [DECIDE] 使用三层权限模型 — 避免大前缀白名单风险
```
