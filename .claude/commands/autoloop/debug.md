---
name: autoloop:debug
description: 自主 bug 猎杀循环。迭代定位和消灭 bug 直到零错误。
argument-hint: "[Scope: <glob>] [Verify: <cmd>] [--iterations N]"
---

# /autoloop:debug — 自主 Bug 猎杀

> 每轮委托 `systematic-debugging` 的 4 阶段框架，遵循其 3-try 停止规则。
> 轮间切换假设方向而非盲目重试。

## 与 systematic-debugging 的关系

| systematic-debugging | autoloop:debug |
|---------------------|----------------|
| 单个 bug 的深度分析 | 多个 bug 的迭代消除 |
| 3 次修复失败后停止 | 3 次失败后切换方向，继续下一个 bug |
| 手动触发 | 自动循环 |

## 循环协议

```
For each bug found:
  1. 委托 systematic-debugging Phase 1-4
     - Phase 1: Root Cause Investigation
     - Phase 2: Pattern Analysis
     - Phase 3: Hypothesis & Testing
     - Phase 4: Implementation

  2. 如果 Phase 4 成功（bug 修复）：
     → experiment: fix — <bug 描述>
     → 追加 results.jsonl（status=keep）
     → 继续下一个 bug

  3. 如果 3 次修复失败（systematic-debugging 的停止规则触发）：
     → 停止当前 bug
     → 记录为 architectural_issue
     → 切换到下一个 bug（不是重试同一个）
     → 在 results.jsonl 记录 status=deferred

  4. 终止条件：
     - Verify 命令返回 0 错误
     - 所有发现的 bug 都已处理（修复或 deferred）
     - 达到 --iterations 上限
     - 用户中断
```

## 7 种调查技术

在 Phase 1 (Root Cause Investigation) 中可选用：

1. **二分法** — git bisect 或手动二分定位引入 bug 的变更
2. **最小复现** — 剥离无关代码，构建最小复现用例
3. **对比分析** — 对比工作版本 vs 破损版本的差异
4. **依赖追踪** — 追踪数据流和调用链
5. **日志注入** — 在关键路径添加临时日志
6. **状态快照** — 在断点处 dump 完整状态
7. **反向推理** — 从期望输出反推每一步应有的状态

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `Scope` | 当前项目 | 搜索 bug 的范围 |
| `Verify` | 自动检测（test runner） | 验证命令 |
| `--iterations` | ∞ | 最大处理 bug 数 |

## 示例

```
/autoloop:debug Scope: src/**/*.ts Verify: npm test

/autoloop:debug Verify: python -m pytest -x --iterations 10
```
