# Agent Orchestration

> 本文件覆盖**基础设施 agent**（code-reviewer / security-reviewer，lowercase 名）。**专长 agent**（Frontend Developer / Backend Architect 等，Capital Phrase 名）见 `~/.claude/CLAUDE.md §Agent 路由`。spawn 时一律用 frontmatter `name` 字段值。机制变更的三个清单（删除扫描 / 新增注册 / 完成门）与 Hook 文案锚点规则在 `on-demand/self-evolution.md`。

## Available Agents（`~/.claude/agents/`）

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| code-reviewer | Code review | 高风险改动需要独立视角，或用户明确要求时 |
| security-reviewer | Security analysis | 安全敏感改动或显式安全审计时 |

## Agent Usage Gate

默认单 agent 直接完成任务。只有同时满足以下条件才派子 agent：① 子任务可独立描述和验证 ② ownership 与写入范围清楚，和主线程冲突低 ③ 独立视角或并行能明显降低风险或关键路径时间 ④ 不会把同一 Review/Verify 阶段重复执行。

写了代码、修了 bug、任务较复杂，本身都不是派 reviewer 的理由。普通 Review 由主 agent 执行一次；只有高风险任务确需独立视角或用户明确要求时才派一个 reviewer。模型：机械 / 检索型子代理 spawn 时传 `model: sonnet`（不传 = 继承主会话最贵档），裁决 / 审查型才继承。

## Design System Routing

小型样式修复和范围明确的组件改动由主 agent 直接处理。只有新页面、关键用户流、信息架构或品牌/无障碍风险较高的 UI 工作才考虑 `design-consultation`。

## Parallel Task Execution

并行是优化手段，不是默认流程。只有两个以上子任务彼此独立、共享文件冲突低、各自有验收命令且并行收益明显时才并行。并发后台代理 ≤ 6–7（服务端 429），结果增量写文件当检查点，禁止代理再派子代理。

## Multi-Perspective Analysis

多视角只用于用户显式要求的全局审计，或确有安全/架构风险的任务。先定义每个视角的独立问题和输出，避免多个 reviewer 重复检查同一 diff。

## Audit Task Routing（强制）

用户要求全局性审查/审计时必须遵循 `~/.claude/on-demand/audit-protocol.md`：① Explore agent 不出结论 ② 安全审计独立启动 ③ HIGH+ 发现由主 agent 亲自运行验证命令确认 ④ 信息收集 → 安全审计 → 主 agent 验证 → 对抗性审查。
