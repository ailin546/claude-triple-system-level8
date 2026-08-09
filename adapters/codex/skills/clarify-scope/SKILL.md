---
name: "clarify-scope"
description: "用于需求宽泛、Brownfield 接入或缺少验收边界时：先查现有能力，再确认必要增量、非目标、验收与改动预算；保持 Codex 原生轻量流程。"
---

# Clarify Scope

这个技能实现轻量 Requirement Confirmation Gate：在执行前把模糊需求压缩成可
执行边界，尤其防止 Brownfield 的“接入/支持”被扩张成新的独立系统。

## 适用场景

- 用户描述的是想法、方向、系统、产品目标，而不是明确改动
- 缺少验收标准、非目标、约束或决策边界
- 需求影响面可能跨模块、跨角色或跨长期工作流
- 直接实现可能带来方向性偏差
- Brownfield 中出现“接入、支持、新增市场、兼容、复用、完整方案、重构”等扩展信号
- 任务可能新增架构、状态系统、执行平面、数据库表、后台服务或策略类型

## 不适用场景

- 用户已给出明确文件、行为和验收标准
- 小修、小问答、简单解释
- Fast、无歧义、低风险且不会改变架构边界的小任务
- 用户明确要求直接执行，且任务确属上述低风险小任务

“直接做”不能覆盖尚未确认的 Brownfield 范围、Heavy 风险或新子系统决策。

## Facts vs Decisions

- **代码库事实（Facts）**：现有模块、接口、策略、依赖、数据流、测试、近期改动等。
  先用代码、文档、测试和 git 历史查证，不向用户提问。
- **用户决策（Decisions）**：产品范围、兼容边界、是否接受新依赖、取舍与非目标等。
  只有无法从仓库确定且会改变实现方向的决策才询问用户。
- 当用户描述与代码事实冲突时，先给证据并指出差异，再询问哪个目标应当成立。

每轮最多问一个最高杠杆问题。问题必须同时给出推荐答案和一句理由，不能只问
“你想怎么做”。

## Brownfield Preflight

对接入、支持、新增市场、兼容、复用、完整方案和重构类需求，实施前必须完成：

1. 读取相关代码、架构文档、测试和近期改动。
2. 建立 **Existing Capability Map**：现有能力、实现位置、可复用入口及证据。
3. 从目标减去现有能力，得到 **Required Delta**；只规划缺口，不重建已有能力。
4. 明确 **Non-goals**、约束/不变量和可观察的 **Acceptance Checks**。
5. 给出 **Change Budget**，用来发现偏航。

Existing Capability Map 可以很短，但必须回答：

| Capability | Existing Implementation | Reuse Path | Evidence / Gap |
| --- | --- | --- | --- |
| 现有能力 | 文件、模块或接口 | 本次如何复用 | 已满足或缺口证据 |

## 工作流

1. 先读取可发现的上下文，不向用户询问能从代码、文档或近期改动查到的事实。
2. 对 Brownfield 先完成 Existing Capability Map，再提出当前意图假设。
3. 用 `Goal - Existing Capabilities = Required Delta` 检查是否在重复造系统。
4. 只对剩余用户决策提问；每轮最多一个问题，并附推荐答案和理由。
5. 输出 Execution Brief，标出已验证事实、显式用户决定和仍待批准项。
6. 通过下方批准门后，才进入 `$plan-execute` 或直接执行。

## 澄清问题优先级

1. `Existing Capabilities`：仓库已经提供什么，证据在哪里？
2. `Required Delta`：本次真正缺少什么？
3. `Non-goals`：哪些相邻能力明确不做？
4. `Constraints/Invariants`：不能破坏哪些兼容性、性能、依赖或流程？
5. `Acceptance Checks`：用什么证据判断完成？
6. `Decision Boundaries`：哪些决定 Codex 可以自行做，哪些必须回问？
7. `Change Budget`：什么规模或架构变化代表已经偏航？

## 可执行简报格式

```markdown
## Execution Brief

- Goal:
- Existing Capabilities:
- Required Delta:
- Non-goals:
- Constraints/Invariants:
- Acceptance Checks:
- Decision Boundaries:
- Change Budget:
- Suggested Path: Fast / Standard / Heavy
```

## Change Budget

`Change Budget` 是偏航报警线，不是代码 KPI，也不是要求为了压行数牺牲正确性。
至少记录：

- 预计修改的文件或目录范围；
- 生产代码量级，例如“小于约 100 行”“数百行内”或“跨 2–3 个模块”；
- 是否允许新增依赖、策略类型、执行平面、数据库表和后台服务；
- 回退点或可以停止的最小交付边界。

如果实际文件/生产代码规模超过预计约两倍，或出现预算外的新依赖、新状态系统、
新执行平面、新数据库表、新后台服务或独立子系统，必须触发 Scope Drift Gate。

## Approval Gate

- **Fast 且无歧义**：不要求 Execution Brief 或额外批准，直接执行并验证。
- **Standard 且存在多种合理理解**：先输出 Execution Brief；影响实现方向的用户决策
  必须得到明确确认。
- **Brownfield 扩展**：Existing Capabilities、Required Delta、Non-goals、Acceptance
  Checks 和 Change Budget 必须向用户展示并得到确认。
- **Heavy 或新架构/新状态系统**：必须得到用户对 Execution Brief 的明确批准。

“明确批准”是用户确认该 Brief 或给出等价、无歧义的范围决定；沉默、继续分析或
Codex 自行选一个合理方案都不算批准。

## Scope Drift Gate

实施中出现以下任一情况时，停止扩大实现：

- 超过 Change Budget 约两倍；
- Required Delta 之外出现新的产品能力或独立子系统；
- 需要原 Brief 未允许的新依赖、策略类型、执行平面、数据库表或后台服务；
- 为完成局部接入而开始替换已有架构或重写可复用能力。

停止后应报告 `Budget vs Actual`、新发现的代码库事实、为什么原 Required Delta 已
不足，以及推荐的最小调整。回到 Requirement Confirmation Gate，得到确认后才能
继续；不能静默修改 Brief 或把扩张写进计划。

## 纪律

- 不把访谈做成问卷；每轮只问最关键的一个问题。
- 对 brownfield 项目，先查本地事实，再问用户确认。
- 先做减法：优先复用现有能力，只补 Required Delta。
- 如果用户选择继续执行但仍有不确定性，明确列出假设和风险。
- 只在不澄清会明显影响结果时启用本技能。
- 不强制写设计文档、commit、启动子代理或建立阻塞状态机。
