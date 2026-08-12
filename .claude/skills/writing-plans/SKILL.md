---
name: writing-plans
description: Use for multi-step Standard or Heavy work after scope and acceptance criteria are sufficiently clear.
---

# Plan

本 Skill 对应共享工作流的 Plan 阶段。计划用于控制范围并继续实施，不是交付终点。

## 前置检查

- Required Delta、Non-goals、Acceptance Checks 和 Change Budget 已明确。
- Brownfield 任务已经识别 Existing Capabilities。
- Heavy 或新架构类 Brief 已得到用户确认。

缺少上述边界时返回 `brainstorming`/`specify`，不能用计划替用户补产品决策。

## 最小计划格式

- 目标
- 关键约束
- Required Delta
- Non-goals
- Change Budget
- 实施步骤
- 每步验证
- 风险与回退点

步骤数量按任务复杂度决定。每一步必须能追溯到 Required Delta，并有可观察的验证点。

## 纪律

- 不强制 TDD；修 bug 优先复现，适合测试先行时再使用 TDD。
- 不自动创建 worktree、commit 或文档。
- 不派发 plan reviewer 或 staff reviewer。
- 不因存在 subagent 能力就默认并行。
- 计划完成后，在批准条件已满足时直接进入 `executing-plans`。

需要持久化计划时，使用项目现有约定；没有约定时优先 `docs/plans/`，但只在跨会话或用户要求时创建文件。
