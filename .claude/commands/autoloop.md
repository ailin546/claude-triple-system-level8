---
name: autoloop
description: 自主目标驱动迭代。修改→验证→保留/回滚→重复
argument-hint: "[Goal: <text>] [Scope: <glob>] [Verify: <cmd>] [Guard: <cmd>] [--iterations N] [--chain debug,security,fix]"
---

# /autoloop — 自主目标驱动迭代循环

> 加载 `autoloop` skill 并启动循环。

## 参数解析

从 `$ARGUMENTS` 提取以下参数：

| 参数 | 格式 | 必填 |
|------|------|------|
| `Goal:` | 自然语言文本 | 是 |
| `Scope:` | glob 模式 | 是 |
| `Metric:` | 指标名称 | 是 |
| `Direction:` | `higher` 或 `lower` | 是 |
| `Verify:` | shell 命令 | 是 |
| `Guard:` | shell 命令 | 否 |
| `--iterations` | 整数 | 否（默认无限） |
| `--budget` | 秒数 | 否（默认 300） |
| `--plateau` | 整数 | 否（默认 10） |
| `--noise` | `none`/`medium`/`high` | 否（默认 none） |
| `--min-delta` | 浮点数 | 否（默认 0） |
| `--chain` | 逗号分隔的子命令 | 否 |

## 流程

### 1. 检查参数完整性

如果所有必填参数都已提供 → 跳到步骤 3。

### 2. 交互式向导（必填参数缺失时）

**Batch 1**（4 问，使用 AskUserQuestion）：

1. **"优化目标是什么？"** → Goal
   - 选项：基于项目类型推荐（提高测试覆盖率 / 降低构建时间 / 减少 lint 警告 / 自定义）

2. **"哪些文件可以修改？"** → Scope
   - 选项：从项目结构推荐 glob（`src/**/*.ts` / `lib/**/*.py` / 自定义）

3. **"用什么命令衡量指标？"** → Verify
   - 选项：从检测到的工具推荐（`npm test -- --coverage` / `python -m pytest --cov` / 自定义）

4. **"指标越高越好还是越低越好？"** → Direction
   - 选项：`higher`（覆盖率、通过率）/ `lower`（错误数、构建时间）

**Batch 2**（3 问，使用 AskUserQuestion）：

5. **"Guard 命令？"** → Guard
   - 说明：可选，防止优化时破坏其他功能
   - 选项：`npm test`（全测试套件）/ `npm run lint`（lint 检查）/ 无 / 自定义

6. **"运行模式？"** → Iterations
   - 选项：无限（直到平台期）/ 有限（输入轮次数）

7. **干运行验证** → 运行 Verify 命令确认可用，显示基线值

### 3. 保存配置

将配置保存到 `.claude/experiments/config.json`：

```json
{
  "goal": "...",
  "scope": "...",
  "metric": "...",
  "direction": "higher|lower",
  "verify": "...",
  "guard": "...|null",
  "iterations": "N|null",
  "budget_seconds": 300,
  "plateau_threshold": 10,
  "noise": "none|medium|high",
  "min_delta": 0,
  "started_at": "ISO-8601",
  "chain": ["debug", "security"]
}
```

### 4. 启动循环

调用 `autoloop` skill 的核心循环协议（Phase 0-10），传入配置。

### 5. 链式执行（如有 --chain）

循环结束后，如果指定了 `--chain`，按顺序调用子命令：

```
/autoloop Goal:... --chain debug,security,fix
→ 先运行主循环
→ 再运行 /autoloop:debug
→ 再运行 /autoloop:security
→ 再运行 /autoloop:fix
```

## 示例

```
/autoloop Goal: 提高测试覆盖率到 90% Scope: src/**/*.ts Metric: coverage Direction: higher Verify: npm test -- --coverage Guard: npm run lint --iterations 20

/autoloop Goal: 减少 lint 警告到 0 Scope: lib/**/*.py Verify: python -m ruff check --statistics Direction: lower --plateau 5

/autoloop  ← 无参数启动向导
```
