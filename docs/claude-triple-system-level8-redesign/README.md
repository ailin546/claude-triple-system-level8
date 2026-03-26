# Claude Triple System Level 8 重构文档包

> 目标：把 `claude-triple-system-level8` 从“默认全开、流程偏重”的系统，重构为“默认轻量、按风险升级、重型能力按需启用”的 AI 工作流平台。

## 适用对象

- 负责重构该系统的 Claude / Codex / 其他执行型 AI
- 维护 `.claude`、`CLAUDE.md`、hooks、commands、shared-state 的操作者
- 需要把流程自动化边界重新划清的系统设计者

## 文档清单

- `architecture.md`
  - 新架构总览，定义 5 个平面和边界。
- `routing.md`
  - 任务如何自动进入 `Fast / Standard / Heavy` 三档模式。
- `automation.md`
  - 哪些流程应该自动化，如何触发，何时降级。
- `manual-commands.md`
  - 手动命令的使用说明、适用场景与执行顺序。
- `permissions.md`
  - 权限模型与默认批准边界。
- `shared-state.md`
  - 多 agent 协作控制面与共享状态设计。
- `recovery.md`
  - hooks、memory、shared-state、权限异常时的降级与恢复流程。

## 设计原则

1. **默认流程轻量**：不把复杂任务的治理成本（TDD、shared-state、多 agent、重型 memory）强加给所有任务。
2. **权限宽松、守卫兜底**：默认保持全权限避免人工授权打断，风险靠 hook 守卫（careful-guard、pre-tool-escalate）控制。
3. 自动化优先覆盖”高收益、低风险、低噪音”的动作。
4. 高价值但高成本的流程按条件触发，而不是默认触发。
5. 用户指令始终高于系统流程。
6. 流程必须可以降级，不能因为一个子系统失效就阻塞所有工作。
7. 记忆只保留决策、约束和未完成事项，不保留流水账。

## 推荐实施顺序

1. 先落地 `routing.md` 的模式分流。
2. 再按照 `automation.md` 裁剪 hooks。
3. 再确认 `permissions.md` 的风险守卫机制到位（hook 层，非配置层收紧）。
4. 再实现 `shared-state.md` 的最小可靠控制面。
5. 最后用 `recovery.md` 补齐降级与运维说明。

## 交付标准

- 小任务不再被 TDD、review、shared-state 等重型流程打断。
- 中等任务能自动获得适量验证和流程支持。
- 高风险任务能自动升档并接入正确的治理能力。
- 手动命令使用说明清晰，调用时机明确。
- 系统任何一层出问题时，都能退回单 agent 安全模式继续工作。
