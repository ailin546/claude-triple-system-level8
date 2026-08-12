---
name: brainstorming
description: Use when requirements are broad, Brownfield scope is unclear, or a consequential design choice needs user confirmation.
---

# Requirement Confirmation

本 Skill 是共享工作流在 Claude 中的需求确认适配器，对应 Codex 的 `clarify-scope`。
它不是所有任务的强制前置步骤。

## 触发条件

- Brownfield 接入、兼容、复用、完整方案或重构
- 目标、必要增量、非目标或验收状态不清
- 可能引入新架构、状态系统、数据库表、后台服务或独立子系统
- 多种合理实现需要用户做产品或风险取舍

Fast、范围清楚、低风险的任务直接实施，不触发本流程。

## 流程

1. 先查代码、文档、测试和近期改动，区分仓库事实与用户决策。
2. 输出紧凑 Execution Brief：
   - Goal
   - Existing Capabilities
   - Required Delta
   - Non-goals
   - Constraints/Invariants
   - Acceptance Checks
   - Decision Boundaries
   - Change Budget
   - Suggested Path
3. 只有仍存在会实质改变方案的决策时才提问；每轮最多一个最高杠杆问题，并给推荐答案和理由。
4. Heavy 或新架构类 Brief 必须取得用户明确确认；其余情形在边界充分时继续实施。

## 停止规则

- 不自动创建或提交设计文档。
- 不派发 spec reviewer，不做循环复核。
- 不为已明确的 Fast 任务制造确认关卡。
- 实施规模超过 Change Budget 约两倍时，停止扩张并报告 Budget vs Actual。

## 输出原则

需求确认的产物是决策边界，不是长篇设计稿。没有未决用户选择时，应继续进入计划或实施。
