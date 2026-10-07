# Claude + Codex Unified Workflow

## 目标

本仓库是 Claude Code 与 Codex 工作流的唯一代码来源。两个客户端共享流程语义、
项目记忆和全局知识，但保留各自的配置格式、Hook 事件载荷和运行状态。

## 架构

系统采用“共享语义内核 + 原生适配器”，而不是要求 Claude 和 Codex 使用同一种
配置格式：

- `shared/workflow/manifest.json`：跨客户端能力、约束和映射的机器可检查入口。
- `shared/workflow/adapters/codex/`：Codex 指令、Hook 和八个 Skill 的唯一源。
- `adapters/codex/`：由 `scripts/sync_workflow.py` 生成的可安装产物。
- `docs/CODEX_USAGE.md`：Claude 八阶段生命周期在 Codex 中的原生用法。
- `.claude/` 与 `CLAUDE.md`：Claude 原生适配器，与 Codex 共享轻量交付生命周期。
- `shared/workflow/claude-baseline.json`：Claude 关键入口的兼容基线。

这种结构允许两端保留原生能力，但路由、澄清、计划、验证、迭代、审查、诊断和
交接八类语义必须在 manifest 中成对映射。Codex 产物发生手工漂移或 Claude 关键
入口未经评审变化时，检查会失败。

Codex 的日常调用、Fast/Standard/Heavy 路径和阶段映射见
[`CODEX_USAGE.md`](CODEX_USAGE.md)。

## 运行边界

两端共同遵循“复用优先、先简后繁”：先核实已有能力并完成最小安全闭环，复杂化必须
证明必要性；超预算先做复用、删减和分期审查，不默认扩容，也不省略资金安全与恢复。
执行规则分别落在 Codex 全局 AGENTS 和 Claude `rules/common/workflow.md`；已承诺
需求的延期或取消仍需用户确认，不新增 Hook 或流程状态机来实现这项原则。

- Claude Code 使用原生 Hooks，但流程层统一为共享生命周期；Superpowers 活动入口已停用。
- Codex 使用 `adapters/codex/` 中的生成适配器。
- 两端全局记忆统一到 `~/.memory/`。
- 两端项目记忆统一到 `PROJECT/.memory/`。
- Claude 与 Codex 的运行时状态不共享。

## 更新纪律

- 不在两个仓库中复制修改；后续只更新本仓库。
- 不直接编辑 `adapters/codex/AGENTS.md` 或其八个 Skill；修改
  `shared/workflow/adapters/codex/` 后运行：

  ```bash
  python3 scripts/sync_workflow.py
  ```

- 修改 Claude 受保护入口前，先同步更新 manifest 中的共享语义或能力映射，完成
  兼容评审后再显式刷新基线：

  ```bash
  python3 scripts/sync_workflow.py --refresh-claude-baseline
  ```

- 常规检查不得刷新基线；CI 只运行：

  ```bash
  python3 scripts/sync_workflow.py --check
  ```

- `adapters/codex/install.sh --check` 必须通过。
- Claude 相关改动必须证明现有基线未发生非预期变化。
- 合并前验证重复安装幂等、无重复 Hook、共享记忆路径一致。

## 兼容保证

- Claude/Codex 收敛修改必须显式刷新 baseline，并通过共享映射检查。
- Claude 仍可独立演进，但变更必须经过显式 baseline review，避免悄悄破坏 Codex
  映射。
- 两端均不启用 Superpowers 插件入口；需求确认、计划、审查、验证由共享语义的原生
  适配器提供。
- Codex 安装器遇到无效 TOML、无效 JSON 或未知 Hook 事件结构时，在写入前失败。
- Hook 只按规范化后的完整目标路径识别自身条目，不按脚本文件名误删用户 Hook。
- 共享的是知识文件和流程语义；锁、日志、transcript、会话与客户端状态继续隔离。

## 2026-10-07 兼容评审：harness 收缩（Claude 侧改用原生能力）

依据 `quant-deploy/reports/harness-slim-plan-2026-10-07.md`（Codex 对抗审查 14 条已吸收）。Claude 侧删除 Fast/Standard/Heavy 模式机器、提醒型 hook、自建记忆轮转、Board 模式与对应 command / skill；共享语义不变，映射改为：

| capability | Codex 侧 | Claude 侧新家 |
|---|---|---|
| triage | system-triage | `CLAUDE.md` §工作方式：一句话能描述 diff 直接做，否则原生 plan mode |
| clarify_scope | clarify-scope | `CLAUDE.md`：AskUserQuestion 访谈写 SPEC；`rules/common/workflow.md` step 0 |
| plan_execute | plan | `CLAUDE.md` / `workflow.md`：plan mode + 每步 `→ verify:` |
| iterative_improvement | evaluation loop | `CLAUDE.md`：原生 `/goal` 或 Stop hook 门，有基线与指标才循环 |
| handoff_memory | shared memory | `shared/memory/PROTOCOL.md`：`PROJECT/.memory/auto/`（原生 auto memory，Claude/Codex 共用）+ `handoff.md`；同步只经 push-all / pull-all |
| 完成门 | — | `.claude/on-demand/self-evolution.md`（自 agents.md 迁入） |

Codex 侧 AGENTS.md / 八个 Skill 的语义（Fast/Standard/Heavy 分类、共享记忆读 `~/.memory` 与 `PROJECT/.memory`）仍成立：Codex 保留自己的分类，Claude 侧不再有对应状态机；记忆路径按新协议读 `auto/MEMORY.md`。受保护文件基线随本次显式刷新。
