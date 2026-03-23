# 核心原则

> 改编自 uditgoenka/autoresearch（Karpathy 提炼）的 7 个通用原则。

## 7 原则

### 1. 单一数值裁判（Single Metric Judge）

每个实验循环有且仅有一个机械化的数值指标。不依赖主观判断。

- 好例子：`coverage = 85.2%`、`lint_warnings = 12`、`build_time = 45s`
- 坏例子："代码看起来更好了"、"应该更快了"

### 2. 原子变更（Atomic Changes）

每次迭代只做一件事。一句话能解释。

- 好例子："添加 auth 中间件的单元测试"
- 坏例子："重构 auth 模块并添加测试和修复 lint"

### 3. Git 作为记忆（Git as Memory）

git log 是 agent 的持久记忆。通过 `experiment:` 前缀的 commit message 记录每轮假设和结果。

### 4. 固定/可变分离（Fixed/Mutable Separation）

使用 `/freeze` 锁定不应被修改的文件。只在明确的 scope 内做变更。

### 5. 数据驱动决策（Data-Driven Decisions）

- 指标改进 → keep
- 指标退步 → discard（revert）
- 指标不变 → discard（无意义的变更）

没有"我觉得应该保留"的空间。

### 6. 失败是信息（Failure is Information）

被 discard 的迭代不是浪费。它们排除了搜索空间中的无效方向。results.jsonl 中的失败记录在后续轮次中用于避免重复。

### 7. 时间预算（Time Budget）

每轮验证有固定时间预算（budget_seconds）。保证迭代之间的可比性，防止某一轮验证耗时过长影响整体节奏。
