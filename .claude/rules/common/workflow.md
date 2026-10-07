# Development Workflow

> 交付语义：Requirement Confirmation（按条件）→ Plan → Execute → Review → Verify → Docs Sync → Summary。
> 一句话能描述 diff 的任务直接 Execute → Verify → Summary。

## 复用优先、先简后繁

- **先查再补**：Required Delta = 当前目标 − 已验证的现有能力。先读实现、调用路径和测试，优先通过既有配置、扩展点与执行链路接入，不因接口不熟就重建。
- **先完成最小安全闭环**：先让一个明确场景端到端可用，再依据真实重复需求推广。静态配置和受控人工预检能满足当前验收时，不先建设动态编排、通用框架或跨节点接管。
- **复杂化须有证据**：新增抽象、依赖、服务、状态系统或账本前，说明现有能力及更简单方案为什么无法满足本次验收；"以后可能用到"不构成理由。
- **超预算先减法**：先检查复用、删减和分期，再讨论扩容；生产逻辑、测试、文档和机械接线分别报告，不用文件数、测试数或原始行数冒充复杂度与完成度。
- **简化不减安全**：权限、资金正确性、幂等、未知结果、撤单竞态、必要持久恢复和审计不能以首版为由跳过；语义不同的事实不能为去重而强行合并。

## Feature Implementation Workflow

0. **Requirement Confirmation（按条件）**：Brownfield、存在多种合理理解或新架构任务，先查 Existing Capabilities，锁定 Required Delta、Non-goals、Acceptance Checks 和 Change Budget；新增子系统取得用户确认后再实施。大需求让 Claude 先用 AskUserQuestion 访谈再写 SPEC。
1. **Plan**：多文件 / 不熟悉的代码 / 方案未定 → 原生 plan mode；每步带 `→ verify:`。不强制 PRD、架构文档或 task_list；默认不派 planner。
2. **Execute**：先查项目内已有实现与测试；默认最小充分改动；修 bug 优先复现原症状。实际规模超过 Change Budget 约两倍或出现预算外子系统时停止扩张并重新确认，重新确认前先提复用、删减或分期方案。
3. **Review**：非平凡或高风险改动按风险审查一次；普通改动主 agent 自审。只有第一次发现 Critical/High 并完成修复后才允许一次复核；第三次及以后需用户明确要求。资金路径另加一次 Codex 对抗审查，不占上述次数（`~/.claude/CLAUDE.md §Codex 调用规则`）。
4. **Verify**：选择最小但有意义的 build、types、lint、tests 或安全检查，对照验收条件；完成声明必须附最新、相关的验证证据，不能运行的部分明确披露。可度量改进用原生 `/goal` 或 Stop hook 门，有基线、指标、验证命令时才做循环。
5. **Docs Sync / Summary**：只有行为、接口、配置或运维方式改变时同步相关文档；说明已验证、未验证和剩余风险。
6. **Commit & Push**：用户要求或交付流程包含发布时，见下方 Git Workflow。

## Git Workflow

Commit message：`<type>: <description>`，type ∈ feat / fix / refactor / docs / test / chore / perf / ci。Attribution 已全局关闭（`~/.claude/settings.json`），不加 Co-Authored-By。

PR：分析全部 commit 历史（`git diff <base>...HEAD`），写完整摘要与测试计划，新分支 `push -u`。
