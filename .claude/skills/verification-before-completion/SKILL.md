---
name: verification-before-completion
description: Use before claiming completion to require fresh, relevant evidence and disclose unverified items.
---

# Verification Gate

本 Skill 对应共享工作流的 Verify 阶段。

## 证据优先级

1. 实际运行结果
2. 相关测试、lint、typecheck 或 build
3. 代码路径和静态分析
4. 合理推断

只有第 4 类证据时，不得声称“已验证”或“没有问题”。

## 最小充分验证

- 文档：目视检查、链接和路径检查
- 单文件逻辑：相关测试或最小静态检查
- 跨文件功能：相关测试，加至少一条端到端行为或调用路径证据
- 高风险任务：明确验证路径；不能运行的部分必须说明原因和风险

## 一轮完成门

默认只执行一轮最小充分验证。失败时修复真实原因并重跑失败的相关验证；这属于同一完成门，不是新增 review 轮次。

收尾必须区分：

- Verified：实际运行确认
- Inferred：根据代码或上下文推断
- Not Verified：受环境或权限限制未验证

不得用无关测试、旧输出或“应该可以”替代新证据。
