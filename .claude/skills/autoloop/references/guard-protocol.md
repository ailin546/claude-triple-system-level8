# Guard 命令协议

> 基于 uditgoenka/autoresearch 的 guard 机制。

## 概念

Guard 是一个可选的**回归防护命令**。即使主指标改进了，如果 guard 失败，变更也会被拒绝。

典型用例：
- 主指标：测试覆盖率 → Guard：`npm run lint`（确保覆盖率提升不破坏代码质量）
- 主指标：构建时间 → Guard：`npm test`（确保构建优化不破坏功能）
- 主指标：bundle size → Guard：`npm run e2e`（确保体积优化不破坏 E2E 测试）

## 执行流程

```
Phase 6 (VERIFY) 完成后：

如果没有配置 Guard → 跳过，进入 Phase 7

如果配置了 Guard：
  1. 运行 Guard 命令
  2. 检查退出码
     - 0 (pass) → guard="pass"，进入 Phase 7
     - 非0 (fail) → guard="fail"

  Guard 失败时：
    retry_count = 0

    WHILE retry_count < 2:
      1. 分析 Guard 失败原因
      2. 修复（不改变主指标优化的方向）
      3. 重新提交：experiment: guard-fix — <修复描述>
      4. 重新运行 Guard
      5. 如果 pass → 重新运行 Verify 确认主指标仍然改进
         - 如果主指标仍改进 → guard="pass"，进入 Phase 7
         - 如果主指标退步 → discard 整个变更（含 guard-fix）
      6. 如果仍 fail → retry_count++

    IF retry_count >= 2:
      → discard 整个变更
      → 在 results.jsonl 记录 guard="fail"
```

## 注意事项

- Guard 命令应该是幂等的（多次运行结果一致）
- Guard 命令应该是快速的（不应比 Verify 命令慢太多）
- Guard 不应该依赖外部服务（网络不可靠时不应阻断循环）
- 如果 Guard 频繁失败，可能需要重新审视 Guard 命令的选择
