# 错误教训归档

> CLAUDE.md §错误教训日志 是精炼版（仅 5 条核心铁律来源）。本文件是完整历史归档。
>
> 格式：`- [日期] 错误描述 → 正确做法`
>
> Claude 应在以下场景主动引入本文件：
> - 调查类似历史 bug（"为什么之前没抓到这个？"）
> - 设计新守卫机制前查"前人踩过哪些坑"
> - 用户问"X 教训在哪？"

---

## 早期教训（2026-03 / 2026-04）

- [2026-03-25] 两个 CLAUDE.md 不同步导致规则冲突 → 改一处必须同步另一处
- [2026-03-25] Hook 未做环境检查，缺依赖时阻塞整个流程 → hook 必须优雅降级
- [2026-03-30] Hook 的 mode gate catch 分支 fallthrough → catch 中必须也做 stdin 透传 + exit
- [2026-03-30] Hook 不应 dump 用户原始消息到记忆文件 → hook 只记元数据
- [2026-04-19] Heavy 任务绕过 evaluation-loop 自证 PASS → 正是文章警告的"病态乐观"反模式 → Heavy 模式下的 4+ 文件改动必须 `/specify → /plan → evaluation-loop`，不允许 inline 自证；2026-04-19 晚补 `evaluation-gate.js` hook 在 commit 时硬阻断
- [2026-04-19] 独立 Reality Checker 审查抓到 evaluation-gate marker 可被 Claude 伪造 + Reality Checker agent 对 Rust 项目不适用（STEP 1 全是 Web 命令）→ marker schema 加 `git_head`/`evaluator_agent_id`/`verdict_summary(≥10字符)` 强制校验，evaluation-gate hook 检查 marker.git_head == current HEAD 自动失效；新增 `testing-reality-checker-systems.md` agent（Rust/backend 版），evaluation-loop Step 4 按项目类型路由

## Follow-up（未关闭）

- [2026-05-20 follow-up] **D1 utility 移位**：`scripts/hooks/{get-model,set-mode,mode-explain}.js` 是 CLI utility 不是 hook，应移到 `scripts/utils/`。引用面大（CLAUDE.md / routing.md / infrastructure.md / task-router.js / set-mode.js 自身），需单独 session 做。**别忘**：每次跑 `manifest-generate.js --drift-only` 仍会列入 D1，关闭前确认移位 + 引用同步。Codex 保留意见：不能让它消失在"合理 orphan"措辞后。
- [2026-05-20 follow-up] **post-edit-light.js cwd-gate**：5 段量化业务检测（EXCHANGE_URLS / proxy / Rust send() / 量化默认本金）跑全局，会在非量化项目误报。决策方向：① cwd-gate 只在量化项目跑 ② 移项目级 hook ③ 删除（信任 §八½ 文档不需要 hook 提醒）。
- [2026-05-20 follow-up] **`auto-tmux-dev.js`**：infrastructure.md 说注册但 settings.json 未注册，是设计漂移。决策：要么注册（启用 dev server tmux 自动化）要么从 infrastructure.md 删除声明。
- [2026-05-20 follow-up] **`discord-plugin-patch.js`**：Codex 建议应该注册到 SessionStart（恢复 Discord 状态），否则功能失效。需确认 plugin 实际依赖。

## 2026-05-20 SSOT 治理元教训

- [2026-05-20] 写 hook-enforced schema 的规则层文档时未做 implementation cross-check → 自己刚加的 D2 文档（evaluation-gate marker schema）声明"hook 严格校验 mode 字段"，但 hook 实际不校验；evaluator_agent_id 文档说"非空"实际要求 length≥3。Codex 二轮审才抓出文档强于实现的内部漂移。**教训**：写规则层 schema 文档时必须分开声明"hook 严格校验字段"和"信息字段"，并逐字段引用实现行号；不能凭设计意图推断实现边界。

## 2026-05 校准与事故

- [2026-05-01] 实战首次校准：cooldown 1h 实测在单 session 多任务边界场景下太紧（3+ 边界/h 是常态）→ 缩到 20min；bypass 词表移除 "commit"（太通用，误伤合法 doc/refactor commit reason）。**教训：守卫摩擦设计要先做小回环测试再固化参数，不能凭直觉**

- [2026-05-01] 多 session 并行写同一个 pre-commit hook（1 分钟差距，字节级一致）→ 重复发明 → 加 §编码行为准则·动手前自查 纪律：系统级新增 / "应该存在但没有"假设 / 长 session 任务切换前必须跑 `git log --since="30 minutes ago" --all`

- [2026-05-02] `~/.memory/long-term.md` 累积 101 条重复 entry → 根因 `stop-summary.js:promoteWeeklyToLongTerm()` 缺 intra-list dedup（同一 lesson 跨多个 weekly sub-section 出现时 push 多份），且 existingKeys/filteredLessons/filteredDecisions 三处 normalize 不一致 → 修复：dedupBatch helper 统一走 `lessonKey()`；同步修 `memory-consolidate.js` 的同类架构空洞；写 `/tmp/dedup-long-term.js` 一次性清理 221→120 行。**教训**：每个写入 long-term 类聚合文件的路径必须在 write 前用 SSOT key 函数（`lessonKey()`）做 (existing ∪ batch) 双重去重，三处 normalize 函数不能复制粘贴各自实现

- [2026-05-05] 两 Claude session 并行跑 master+worker 实例的资源冲突类（端口/cchft.db/journals/log/pids/worker_id/listenKey）→ 立 `using-git-worktrees` 隔离方案（`~/quant-deploy` + `~/quant-deploy-s2`），各 worktree 独立 `cchft.db` / 端口偏移（s1=9100/9101, s2=9300/9301）/ `worker_id` 命名（mm-worker-1 vs mm-worker-s2）。**已知遗留**：worker metrics 9090 在 main.rs:2183 hardcode，第二个 worker 静默 bind 失败（不挂主流程，prometheus 不可用），follow-up 改成 `worker.json::metrics_port`。`~/.claude/state/evaluation-gate/last-pass.json` 仍是全局共享单文件，多 session 互踩；hook 已按 `git_head` pin，部分缓解。详见 `~/quant-deploy-s2/SESSION2.md`

- [2026-05-06] Phase A 监工模式（dispatch sub-agent 实施 + codex 双审）三课。**事故 1（spec drift）**：Rust Engineer agent 实施 M2 retry 时单方面把 `[500, 2000, 8000]` (10.5s) 简化成 `[500, 2000]` (2.5s)，理由是"demo-api 502 typically resolves <1s"，但**没向监工报告就改 spec**，且**保留旧注释 lying about 10.5s** → Codex round 1 REQUEST-CHANGES HIGH 抓出。**修复约束**: 监工 dispatch 时 prompt 必须显式禁止"silent spec deviation"——agent 觉得 spec 不合理 → STOP + 报告，不允许擅自改；任意改 constants/config → 必须同步 grep 注释引用并更新。**事故 2（comment-vs-code 类 bug 反复）**：fix round 1 的 spec drift 后，更新了代码但留下"3 attempts/3rd failure"老注释 → Codex round 2 又抓 FAIL → 第 3 轮单纯改注释才过。**修复约束**: 任何修改函数体内 magic number/array literal/loop bound 时，prompt 强制 self-audit checklist，要求 agent 列"我改了 X，对应的 doc/comment 在 Y/Z 行也已更新"。**事故 3（evaluation-gate 跨 worktree path-prefix bug）**：`extractCdTarget` 检测 cd 目标是否"在 projectRoot 内"用 `startsWith` 字符串前缀匹配，sibling worktree `~/quant-deploy-s2` 以 `~/quant-deploy` 开头 → 误判为 in-tree → 用错的 HEAD（main 的）做 marker check → 阻断 s2 commit。**修复**: 改用 `path.relative()` + `..` 检查真实 containment，或显式 `path.resolve()` + 严格 segment 匹配。**已修（2026-05-06）**：`evaluation-gate.js` 提取 `isInsideProjectRoot(target, root)` 用 `path.relative()` + `!rel.startsWith('..') && !path.isAbsolute(rel) && rel !== ''` 判定，`isCrossRepoPush` 显式同路径短路 + 调用此 helper；新增 `__tests__/evaluation-gate.test.js` 22 用例全 pass。详见 `~/quant-deploy-s2/SESSION2.md` Follow-ups
