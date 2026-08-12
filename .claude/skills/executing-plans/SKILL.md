---
name: executing-plans
description: Use to execute an approved multi-step plan through implementation and relevant verification.
---

# Execute

本 Skill 对应共享工作流的 Execute 阶段。

## 流程

1. 读取计划与当前代码状态，确认没有新的范围冲突。
2. 按依赖顺序实施；每步只做计划内的最小充分改动。
3. 完成一步后运行该步最相关的验证，不机械执行全量管线。
4. 记录计划状态和新发现的风险。
5. 实施完成后按风险进入一次 Review，再进入 Verify。

## Scope Drift Stop

出现以下情况立即停止扩张并返回用户确认：

- 实际改动超过 Change Budget 约两倍
- 出现预算外的新架构、状态系统、数据库表、后台服务或依赖
- 需要突破 Non-goals 或改变 Required Delta
- 原计划依赖的现有能力不存在

## 协作边界

默认单 agent。只有独立、边界清楚、写入范围不冲突的子任务才考虑并行；不得为每个计划步骤自动创建 subagent，也不得为每步自动复核。

## 收尾

说明已完成、已验证、未验证和剩余风险。是否 commit、push、PR 由用户请求和仓库工作流决定，不由本 Skill 自动触发。
