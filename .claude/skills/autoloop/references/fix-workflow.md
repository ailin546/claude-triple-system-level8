# Fix 循环详细流程

> 改编自 uditgoenka/autoresearch fix 子命令，复用 /build-fix 的检测和修复逻辑。

## 委托关系

```
autoloop:fix（泛化超集）
  │
  ├─ --type=build → 委托 /build-fix 完整流程
  │    ├─ Step 1: Detect Build System
  │    ├─ Step 2: Parse and Group Errors
  │    ├─ Step 3: Fix Loop (One Error at a Time)
  │    ├─ Step 4: Guardrails
  │    └─ Step 5: Summary
  │
  ├─ --type=lint → 自有逻辑
  │    ├─ 检测 linter（ESLint/Biome/Ruff/golint）
  │    ├─ 运行 linter，解析警告/错误
  │    ├─ 逐个修复（auto-fix 优先，手动修复次之）
  │    └─ 守卫：不引入新警告
  │
  ├─ --type=type → 自有逻辑
  │    ├─ 检测类型检查器（tsc/mypy/go vet）
  │    ├─ 运行类型检查，解析错误
  │    ├─ 按依赖顺序修复
  │    └─ 守卫：不引入新类型错误
  │
  ├─ --type=test → 自有逻辑
  │    ├─ 运行测试套件
  │    ├─ 解析失败测试
  │    ├─ 逐个修复（先修实现，不改测试）
  │    └─ 守卫：不破坏已通过的测试
  │
  └─ --type=all → 按优先级依次执行
       build → type → lint → test
```

## 共享守卫规则（来自 /build-fix）

所有错误类型共享以下守卫：

1. **一个 fix 引入超过解决的错误** → 停止并 revert
2. **同一错误 3 次尝试后** → 切换策略或标记为 needs_review
3. **修复需要架构变更** → 停止并提问用户
4. **缺少依赖** → 提示安装（`npm install`、`pip install` 等）

## 修复优先级

```
--type=all 时的执行顺序和理由：

1. build  — 构建错误阻断一切
2. type   — 类型错误可能导致运行时 bug
3. lint   — 代码质量问题
4. test   — 测试失败需要理解业务逻辑

每个类型修复完成后，重新运行下一个类型的检查（因为修复可能连锁影响）。
```
