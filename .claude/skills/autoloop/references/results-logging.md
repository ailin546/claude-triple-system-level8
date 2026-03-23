# 结果日志格式

> JSONL 格式，与 `~/.claude/metrics/costs.jsonl` 一致。

## 存储位置

`.claude/experiments/results.jsonl`

## 格式

每轮追加一行（JSONL — 每行一个 JSON 对象）：

```json
{"iteration":0,"timestamp":"2026-03-23T10:00:00Z","commit":"a1b2c3d","metric":85.2,"delta":0.0,"guard":"pass","status":"baseline","description":"initial state — coverage 85.2%","hypothesis":null,"files_changed":[],"duration_seconds":0}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `iteration` | int | 迭代序号（0 = baseline） |
| `timestamp` | ISO-8601 | 记录时间 |
| `commit` | string\|null | git commit SHA（discard 时为 null） |
| `metric` | float | 本轮指标值 |
| `delta` | float | 与上一轮的变化量 |
| `guard` | string\|null | guard 结果：`pass`/`fail`/`null` |
| `status` | enum | `baseline`/`keep`/`discard`/`deferred` |
| `description` | string | 一句话描述变更 |
| `hypothesis` | string\|null | 本轮假设 |
| `files_changed` | string[] | 修改的文件列表 |
| `duration_seconds` | int | 本轮耗时（秒） |

## 读取模式

Phase 3 (REVIEW) 时读取 results.jsonl 的标准模式：

```
1. 读取全部行，解析为对象数组
2. 过滤 status=discard 的记录 → 失败方向集合
3. 过滤 status=keep 的记录 → 成功方向集合
4. 计算连续 discard 次数 → 卡住检测
5. 计算指标趋势 → 平台期检测
```

## 与 decisions.log 的关系

每轮 Phase 8 同时追加两个日志：
- `results.jsonl` — 结构化数据，用于机械化读取
- `decisions.log` — 人类可读，用于审计和调试

格式对比：
```
results.jsonl:  {"iteration":1,"status":"keep","metric":87.1,"delta":1.9,...}
decisions.log:  [2026-03-23T10:05:00Z] [autoloop-001] [DECIDE] iteration 1: keep — description (85.2→87.1, +1.9)
```
