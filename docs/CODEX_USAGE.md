# Codex 统一工作流使用说明

本说明用于在 Codex 中使用与 `claude-triple-system-level8` 语义一致的开发流程。
两端共享生命周期、需求边界和记忆协议，但各自保留原生技能、Hook 与运行状态。

## 一句话流程

```text
Requirement Confirmation（按条件）
→ Plan
→ Execute
→ Review
→ Verify
→ Docs Sync
→ Summary
```

它对应 Claude 当前的：

```text
brainstorming → spec → plan → 执行 → 审查 → 验证 → 同步文档 → 发总结
```

Codex 不把 `brainstorming` 和 `spec` 拆成两个强制阶段，而是合并为条件触发的
Requirement Confirmation Gate。这样既保留需求发现和范围锁定，也不会让清晰的小任务
被设计文档、提交或多轮审查拖慢。

## 阶段映射

| Claude 阶段 | Codex 原生入口 | 产出或完成条件 |
|---|---|---|
| brainstorming | `$clarify-scope`：先查现有能力和近期改动 | 代码库事实、关键歧义、推荐决策 |
| spec | `$clarify-scope`：形成 Execution Brief | Required Delta、Non-goals、验收和 Change Budget |
| plan | `$plan-execute` | 引用 Required Delta、Non-goals 和 Change Budget 的可验证计划 |
| 执行 | Codex 原生编辑与命令 | 最小充分实现；持续检查范围漂移 |
| 审查 | `$code-review-gate` | 按风险和严重级别审查非平凡改动 |
| 验证 | `$verification-gate` | 实际运行最相关检查，区分事实、推断和未验证项 |
| 同步文档 | 只更新受行为、配置或运维变化影响的文档 | 文档与实现一致；不扩写无关内容 |
| 发总结 | Codex 最终回复；跨会话时用 `$handoff-memory` | 做了什么、验证了什么、未验证项、风险和下一步 |

## 什么时候走哪条路径

### Fast

适合清晰、低风险、影响面小的任务，例如修正文档 typo、局部配置或单文件小修。

```text
Execute → Verify → Docs Sync（仅需要时）→ Summary
```

- 默认直接做，不要求 Execution Brief。
- 不强制计划、设计文档、提交或子代理审查。
- 用户明确“直接做”且风险可控时，允许跳过需求澄清。

### Standard

适合跨文件功能、普通 bugfix、兼容改造和一般重构。

范围清楚且只有一种合理理解时：

```text
Plan → Execute → Review（按风险）→ Verify → Docs Sync → Summary
```

存在多种合理理解，或属于 Brownfield 的接入、支持、新增市场、兼容、复用、完整方案、
重构时：

```text
Requirement Confirmation → Plan → Execute → Review → Verify → Docs Sync → Summary
```

### Heavy

适合认证、权限、支付、迁移、部署、并发、系统级重构，或可能新增架构、状态系统、
执行平面、数据库表、后台服务、独立子系统的任务。

```text
Requirement Confirmation（用户明确确认）
→ Plan
→ Execute
→ Review
→ Verify
→ Docs Sync / Handoff
→ Summary
```

Heavy 在实施前必须获得用户对 Execution Brief 的明确确认，不能用内部计划替代用户决策。

## Requirement Confirmation Gate

Codex 先检查代码、文档、测试和近期改动。能从仓库得到的属于 Facts，不问用户；只有
目标取舍、非目标、兼容边界和风险接受度等 Decisions 才需要用户决定。每轮最多问一个
最高杠杆问题，并给出推荐答案和理由。

需要确认时，使用以下简报：

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

`Change Budget` 是范围偏航报警线，不是代码 KPI。它至少说明：

- 预计修改哪些文件或目录；
- 生产代码的大致量级；
- 是否允许新增依赖、策略类型、执行平面、数据库表或后台服务；
- 实际规模超过预计约两倍，或发现需要新子系统时，暂停并重新确认。

Brownfield 任务必须先回答四件事：现有能力是什么、只补什么、明确不做什么、如何验收。

## 实施中的范围漂移

出现以下任一情况时，Codex 停止扩大改动，报告 `Budget vs Actual`，返回 Requirement
Confirmation Gate：

- 实际修改规模超过 Change Budget 约两倍；
- 出现预算外的新架构分支或独立子系统；
- 需要新增状态系统、执行平面、数据库表、后台服务或依赖；
- Required Delta、Non-goals 或验收方式需要被改写。

在用户重新确认前，只允许完成安全收尾、保留已验证结果或回退局部实验，不静默扩张。

## 如何调用

通常直接用自然语言描述任务即可，Codex 会按全局 AGENTS 路由。需要显式控制时，可以说：

- “用 `$clarify-scope` 先确认需求边界，不要实现。”
- “用 `$plan-execute` 按这个 Execution Brief 实施。”
- “用 `$code-review-gate` 审查当前 diff。”
- “用 `$verification-gate` 验证后再汇报完成。”
- “用 `$handoff-memory` 保存跨会话恢复点。”
- “用 `$workflow-doctor` 检查本机工作流安装。”

示例：

```text
检查现有 Solana 与聚合下单能力，先输出 Existing Capabilities、Required Delta、
Non-goals 和 Change Budget；我确认后再实施。不要建立独立交易系统。
```

```text
修正 README 中的一个 typo，直接做并验证。
```

## 文档与记忆

- 行为、配置、接口或运维方式改变时，更新受影响的 README、架构说明或 runbook。
- 纯内部实现且外部约定不变时，不为完成流程而制造无价值文档改动。
- 全局共享记忆位于 `~/.memory/`，项目共享记忆位于 `PROJECT/.memory/`。
- 长任务或跨会话任务结束前，用 `$handoff-memory` 记录目标、决策、已完成、风险和恢复点。
- Hook 只检测和提醒，不负责阻塞阶段或维护工作流状态机。

## 维护这套工作流

Codex canonical 源位于 `shared/workflow/adapters/codex/`。不要直接修改生成产物；修改后运行：

```bash
python3 scripts/sync_workflow.py
python3 scripts/sync_workflow.py --check
python3 -m unittest discover -s adapters/codex/tests -v
bash adapters/codex/install.sh
bash adapters/codex/install.sh --check
```

Claude 继续使用 `.claude/`、`CLAUDE.md` 和原有 Hooks。更新 Codex 说明或适配器时，不应
修改 Claude 的 `brainstorming → spec → plan → 执行 → 审查 → 验证 → 同步文档 → 发总结`
行为。

## 完成检查

一次完整交付至少要能回答：

- 本次 Required Delta 是否全部完成；
- Non-goals 是否被遵守；
- 实际改动是否仍在 Change Budget 内；
- 审查发现的问题是否已处理或明确记录；
- 哪些验证实际运行并通过；
- 哪些文档需要同步且已经同步；
- 最终总结是否区分已验证事实、未验证项和剩余风险。
