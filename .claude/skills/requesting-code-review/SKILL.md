---
name: requesting-code-review
description: Use once before delivery or merge for non-trivial or high-risk changes, or when the user explicitly requests review.
---

# Review Gate

本 Skill 对应共享工作流的单次 Review 阶段。

## 触发条件

- 跨文件或非平凡改动
- 认证、权限、支付、迁移、部署、安全、并发等高风险区域
- 用户明确要求 review
- 合并前需要独立检查

Fast 文档、小配置或单行修复不默认触发。

## 审查维度

- Correctness
- Security
- Architecture
- Performance
- Maintainability
- Verification evidence

Findings 按 Critical、High、Medium、Low 输出，并尽量包含文件行号、风险和具体修复方向。

## 轮次预算

- 默认一次 Review。
- 只有第一次发现 Critical/High 且完成针对性修复后，才允许一次复核。
- 默认最多两次；第三次及以后必须由用户明确要求。
- 不按计划步骤、文件或 reviewer 数量重复审查。

审查可以由当前 agent 完成。只有高风险任务确实需要独立视角，或用户明确要求时，才派发一个 reviewer；不得强制使用子 agent。

## 判定

- Critical/High 或架构 BLOCK：REQUEST CHANGES
- 只有 Medium/Low：COMMENT
- 无实质问题且证据充分：APPROVE

Review 与 Verify 不能互相替代。
