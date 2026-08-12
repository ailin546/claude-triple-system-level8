---
name: evaluation-loop
description: Use only for measurable improvement work with a baseline, metric, verification command, guard command, and bounded rounds.
---

# Bounded Evaluation Loop

本 Skill 对应共享工作流的 `autoresearch-lite`，不是 Standard/Heavy 的默认交付步骤。

## 启动条件

必须同时具备：

- 明确目标与改动范围
- 可量化主指标和基线
- 固定验证命令
- 防回归守护命令
- 每轮结果可以保留、回退或停止

缺少任何一项时，不启动循环，改走普通 Execute → Verify。

## 每轮流程

1. 选择一个聚焦改动
2. 实施改动
3. 运行主指标
4. 运行守护命令
5. 对比基线
6. 保留、回退或停止
7. 记录本轮结果

## 轮次和停止条件

- 小任务最多 2 轮
- 标准任务最多 3 轮
- 用户未指定时默认最多 3 轮
- 连续两轮无有效进展立即停止
- 出现范围漂移、守护失败或不可逆风险立即停止

Evaluator 可以是客观命令或当前 agent 对固定标准的核对，不强制创建 Reality Checker 或其他子 agent。

完成后仍只进行一次 Review（按风险）和一次 Verification Gate；不得把每轮指标检查再叠加成多轮代码复核。
