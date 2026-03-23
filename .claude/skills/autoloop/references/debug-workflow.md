# Debug 循环详细流程

> 改编自 uditgoenka/autoresearch debug 子命令，复用 systematic-debugging 的 4 阶段框架。

## 与 systematic-debugging 的协作模型

```
autoloop:debug（外层循环）
  │
  ├─ Bug 1 → systematic-debugging Phase 1-4
  │            ├─ Phase 1: Root Cause Investigation
  │            ├─ Phase 2: Pattern Analysis
  │            ├─ Phase 3: Hypothesis & Testing
  │            └─ Phase 4: Implementation
  │                 ├─ 成功 → keep，继续下一个 bug
  │                 └─ 3 次失败 → deferred，切换到下一个 bug
  │
  ├─ Bug 2 → systematic-debugging Phase 1-4
  │            └─ ...
  │
  └─ Bug N → ...
```

## 关键规则

### 3-Try 停止规则（来自 systematic-debugging）

```
当修复某个 bug 时：
- 尝试 1: Phase 1-4 完整执行
- 尝试 2: 带有尝试 1 的新信息，回到 Phase 1 重新分析
- 尝试 3: 最后一次机会

3 次失败后：
- 停止当前 bug（不尝试第 4 次）
- 质疑是否是架构问题
- 记录为 deferred（不是 discard）
- 切换到下一个 bug
```

### 切换方向 vs 盲目重试

```
❌ 错误做法：同一个 bug，同样的方向，重试 10 次
✅ 正确做法：3 次后切换到下一个 bug，积累更多信息后可能回来
```

## 7 种调查技术详解

### 1. 二分法
```
git bisect start
git bisect bad HEAD
git bisect good <last-known-good>
# 自动二分定位引入 bug 的 commit
```

### 2. 最小复现
```
1. 从完整复现步骤开始
2. 逐步去除步骤
3. 每次去除后验证 bug 是否仍存在
4. 最终得到最小复现用例
```

### 3. 对比分析
```
1. 找到工作版本（git stash / 另一分支 / 旧 commit）
2. diff 工作版本 vs 破损版本
3. 逐个应用差异，定位引入 bug 的变更
```

### 4. 依赖追踪
```
1. 从错误点开始
2. 追踪数据流（向上追踪输入来源）
3. 追踪调用链（向下追踪函数调用）
4. 在每个节点验证数据正确性
```

### 5. 日志注入
```
1. 在关键路径添加 console.log / print
2. 运行复现步骤
3. 从日志中定位数据变异点
4. 修复后删除临时日志
```

### 6. 状态快照
```
1. 在断点处 dump 完整应用状态
2. 对比期望状态 vs 实际状态
3. 找出第一个偏离点
```

### 7. 反向推理
```
1. 从期望的最终输出开始
2. 反推每一步应有的中间状态
3. 在每步验证实际状态是否匹配
4. 找到第一个不匹配的步骤
```
