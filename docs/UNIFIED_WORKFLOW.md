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
