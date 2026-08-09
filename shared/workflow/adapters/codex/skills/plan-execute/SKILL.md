---
name: "plan-execute"
description: "用于较复杂的编码或系统任务：先定义范围、约束、步骤、验证和风险，再继续实施，避免只停留在分析或计划。"
---

# 计划并执行

这是中重型任务的默认流程技能：先把边界、步骤、验证和风险说清楚，然后继续实施，而不是只给计划就停下。

## 什么时候用

- 跨文件开发
- 中等以上重构
- 需求已经大体清楚，但需要先拆步骤
- 高风险任务需要先把边界、验收和回退点说清楚

## 什么时候不要用

- 用户只是问问题
- 任务非常小，直接做更快更稳
- 需求还很模糊，应该先用 `$clarify-scope`

## 工作流

1. 先确认目标与约束
2. 读取代码或上下文，补足事实
3. 对 Standard/Heavy 执行 Requirement Brief Check
4. 输出紧凑计划
5. 在批准条件已满足时进入实施
6. 按 Change Budget 检查范围漂移
7. 做相关验证
8. 汇报结果、风险和未验证项

## Requirement Brief Check

Standard/Heavy 开始前，先判断是否已有足够的 Execution Brief：

- Standard 且存在多种合理理解、Brownfield 接入/扩展、Heavy、新架构或新状态系统，
  必须有 Brief。
- Brief 至少要能定位 `Required Delta`、`Non-goals`、`Acceptance Checks` 和
  `Change Budget`；Brownfield 还必须有 `Existing Capabilities`。
- 缺少这些字段、字段仍依赖未决用户选择，或 Heavy Brief 尚未批准时，回到
  `$clarify-scope`；不能用计划替用户补齐产品决策。
- Fast 清晰小任务不因本检查被迫升级，不要求补形式化 Brief。

## 计划格式

计划保持紧凑，但必须包含：

- `目标`
- `约束`
- `Required Delta`
- `Non-goals`
- `Change Budget`
- `步骤`
- `验证`
- `风险`

`步骤` 不固定为 5 步，应按任务大小调整。

每个步骤最好附带一个明确验证点，例如：

- 更新解析逻辑 -> 验证：相关单测通过
- 调整接口返回结构 -> 验证：类型检查通过且调用方已同步

## 执行准则

- 计划不是终点，计划后应继续实施
- 若执行中发现原计划失效，更新计划并说明原因
- 若出现真正的分叉决策，再请求用户确认
- 默认沿着低风险、可逆、已被用户请求的路径持续推进
- 每个实施步骤都应能追溯到 Required Delta；Non-goals 不能出现在任务清单中
- 计划必须说明如何观察 Change Budget，而不是只在收尾统计 diff
- 不能把“顺便补齐”“完整方案”或“以后可能需要”静默加入范围

### Scope Drift Stop

出现以下情况时停止实施并重新确认：

- 实际改动范围或生产代码量级超过 Change Budget 约两倍；
- 出现新的架构分支、状态系统、执行平面、数据库表、后台服务或独立子系统；
- 计划需要突破 Non-goals 或改变已批准的 Required Delta；
- 原本应复用的能力被替换或重写。

停止时报告预算与实际差异、触发原因、最小可行调整和回退点。除非用户确认新的
Execution Brief，否则不能继续扩张；不能仅更新内部计划后继续。

## 对 Heavy 任务的加强要求

遇到以下任务时，要显式写出影响面和回退点：

- auth / 认证
- permission / 权限
- payment / 支付
- migration / 迁移
- deploy / 部署
- schema / 数据结构
- production / 生产环境

## 收尾格式

结束时至少交代：

- 已完成内容
- 验证结果
- 未完成或未验证部分
- 剩余风险
