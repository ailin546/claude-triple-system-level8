# Experiments — 实验系统

> autoloop 的实验数据目录。

## 文件说明

| 文件 | 创建方式 | 说明 |
|------|---------|------|
| `config.json` | `/autoloop` 命令生成 | 当前实验的配置参数 |
| `results.jsonl` | autoloop 每轮自动追加 | 实验结果日志（JSONL 格式） |
| `direction.md` | 用户手动编写 | 搜索方向指引（可选） |

## 数据格式

### config.json

```json
{
  "goal": "提高测试覆盖率到 90%",
  "scope": "src/**/*.ts",
  "metric": "coverage",
  "direction": "higher",
  "verify": "npm test -- --coverage",
  "guard": "npm run lint",
  "iterations": null,
  "budget_seconds": 300,
  "plateau_threshold": 10,
  "noise": "none",
  "min_delta": 0,
  "started_at": "2026-03-23T10:00:00Z",
  "chain": null
}
```

### results.jsonl

每轮追加一行（JSONL 格式，与 `~/.claude/metrics/costs.jsonl` 一致）：

```json
{"iteration":0,"timestamp":"2026-03-23T10:00:00Z","commit":"a1b2c3d","metric":85.2,"delta":0.0,"guard":"pass","status":"baseline","description":"initial state","hypothesis":null,"files_changed":[],"duration_seconds":0}
{"iteration":1,"timestamp":"2026-03-23T10:05:00Z","commit":"b2c3d4e","metric":87.1,"delta":1.9,"guard":"pass","status":"keep","description":"add auth tests","hypothesis":"auth 中间件缺少测试","files_changed":["src/auth/middleware.test.ts"],"duration_seconds":287}
```

### direction.md

用户编写的搜索方向指引（Markdown 编程）。autoloop 每轮 Phase 3 (REVIEW) 时读取。

## 集成

- results.jsonl 会被 autoloop Phase 3 读取以避免重复失败方向
- decisions.log 中的 autoloop 条目使用 `[autoloop-NNN]` 前缀
- qa-health-score 趋势追踪存储在 `.claude/qa-scores/trend.jsonl`
