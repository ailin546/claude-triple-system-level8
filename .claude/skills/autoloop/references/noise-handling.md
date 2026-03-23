# 噪声处理策略

> 改编自 uditgoenka/autoresearch Phase 5.1。

## 问题

某些指标具有天然噪声（如性能基准、随机种子的 ML 评估）。单次运行可能产生误导性的结果。

## 策略

### Noise=none（默认）

单次运行。适用于确定性指标（如 lint 警告数、类型错误数、测试通过数）。

### Noise=medium

3 次运行取中位数。适用于低噪声指标（如测试覆盖率，可能因并行执行有微小波动）。

```
runs = [run_verify() for _ in range(3)]
metric = median(runs)
```

### Noise=high

5 次运行取中位数。适用于高噪声指标（如性能基准、API 响应时间）。

```
runs = [run_verify() for _ in range(5)]
metric = median(runs)
```

## 最小改进阈值（Min-Delta）

即使中位数显示改进，如果 delta < Min-Delta，视为无改进（discard）。

用途：过滤掉噪声范围内的微小波动。

```
if abs(delta) < min_delta:
    status = "discard"  # 改进太小，可能是噪声
```

## 确认运行

当 Noise=high 且指标改进显著时，可选择额外的确认运行：

```
if delta > 3 * min_delta and noise == "high":
    # 执行额外 3 次确认运行
    confirm_runs = [run_verify() for _ in range(3)]
    confirmed_metric = median(confirm_runs)
    # 确认中位数与原始中位数一致
```

## 建议配置

| 指标类型 | Noise | Min-Delta |
|---------|-------|-----------|
| lint 警告数 | none | 0 |
| 测试通过数 | none | 0 |
| 测试覆盖率 | medium | 0.5 |
| 构建时间 | medium | 1.0（秒） |
| Bundle size | medium | 100（字节） |
| API 响应时间 | high | 10（毫秒） |
| ML 评估指标 | high | 0.01 |
