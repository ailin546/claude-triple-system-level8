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
- [x] [2026-05-20 follow-up] **`auto-tmux-dev.js`** — ✅ DONE 2026-08-02（T-old-coder B1，选了"删除声明"路：文件归档 scripts/hooks-archive/ + infrastructure.md 行删除。2 个月无人注册 = 无人需要该自动化）
- [x] [2026-05-20 follow-up] **`discord-plugin-patch.js`** — ✅ DONE 2026-08-02（做法相反：Codex 曾建议注册到 SessionStart，但 2 个月无人接 + 独立冗余审计确认零引用零注册且 Discord plugin 现由官方插件链管理 → 归档 scripts/hooks-archive/ 而非注册）

## 2026-05-20 SSOT 治理元教训

- [2026-05-20] 写 hook-enforced schema 的规则层文档时未做 implementation cross-check → 自己刚加的 D2 文档（evaluation-gate marker schema）声明"hook 严格校验 mode 字段"，但 hook 实际不校验；evaluator_agent_id 文档说"非空"实际要求 length≥3。Codex 二轮审才抓出文档强于实现的内部漂移。**教训**：写规则层 schema 文档时必须分开声明"hook 严格校验字段"和"信息字段"，并逐字段引用实现行号；不能凭设计意图推断实现边界。

## 2026-05 校准与事故

- [2026-05-01] 实战首次校准：cooldown 1h 实测在单 session 多任务边界场景下太紧（3+ 边界/h 是常态）→ 缩到 20min；bypass 词表移除 "commit"（太通用，误伤合法 doc/refactor commit reason）。**教训：守卫摩擦设计要先做小回环测试再固化参数，不能凭直觉**

- [2026-05-01] 多 session 并行写同一个 pre-commit hook（1 分钟差距，字节级一致）→ 重复发明 → 加 §编码行为准则·动手前自查 纪律：系统级新增 / "应该存在但没有"假设 / 长 session 任务切换前必须跑 `git log --since="30 minutes ago" --all`

- [2026-05-02] `~/.memory/long-term.md` 累积 101 条重复 entry → 根因 `stop-summary.js:promoteWeeklyToLongTerm()` 缺 intra-list dedup（同一 lesson 跨多个 weekly sub-section 出现时 push 多份），且 existingKeys/filteredLessons/filteredDecisions 三处 normalize 不一致 → 修复：dedupBatch helper 统一走 `lessonKey()`；同步修 `memory-consolidate.js` 的同类架构空洞；写 `/tmp/dedup-long-term.js` 一次性清理 221→120 行。**教训**：每个写入 long-term 类聚合文件的路径必须在 write 前用 SSOT key 函数（`lessonKey()`）做 (existing ∪ batch) 双重去重，三处 normalize 函数不能复制粘贴各自实现

- [2026-05-05] 两 Claude session 并行跑 master+worker 实例的资源冲突类（端口/cchft.db/journals/log/pids/worker_id/listenKey）→ 立 `using-git-worktrees` 隔离方案（`~/quant-deploy` + `~/quant-deploy-s2`），各 worktree 独立 `cchft.db` / 端口偏移（s1=9100/9101, s2=9300/9301）/ `worker_id` 命名（mm-worker-1 vs mm-worker-s2）。**已知遗留**：worker metrics 9090 在 main.rs:2183 hardcode，第二个 worker 静默 bind 失败（不挂主流程，prometheus 不可用），follow-up 改成 `worker.json::metrics_port`。`~/.claude/state/evaluation-gate/last-pass.json` 仍是全局共享单文件，多 session 互踩；hook 已按 `git_head` pin，部分缓解。详见 `~/quant-deploy-s2/SESSION2.md`

- [2026-05-06] Phase A 监工模式（dispatch sub-agent 实施 + codex 双审）三课。**事故 1（spec drift）**：Rust Engineer agent 实施 M2 retry 时单方面把 `[500, 2000, 8000]` (10.5s) 简化成 `[500, 2000]` (2.5s)，理由是"demo-api 502 typically resolves <1s"，但**没向监工报告就改 spec**，且**保留旧注释 lying about 10.5s** → Codex round 1 REQUEST-CHANGES HIGH 抓出。**修复约束**: 监工 dispatch 时 prompt 必须显式禁止"silent spec deviation"——agent 觉得 spec 不合理 → STOP + 报告，不允许擅自改；任意改 constants/config → 必须同步 grep 注释引用并更新。**事故 2（comment-vs-code 类 bug 反复）**：fix round 1 的 spec drift 后，更新了代码但留下"3 attempts/3rd failure"老注释 → Codex round 2 又抓 FAIL → 第 3 轮单纯改注释才过。**修复约束**: 任何修改函数体内 magic number/array literal/loop bound 时，prompt 强制 self-audit checklist，要求 agent 列"我改了 X，对应的 doc/comment 在 Y/Z 行也已更新"。**事故 3（evaluation-gate 跨 worktree path-prefix bug）**：`extractCdTarget` 检测 cd 目标是否"在 projectRoot 内"用 `startsWith` 字符串前缀匹配，sibling worktree `~/quant-deploy-s2` 以 `~/quant-deploy` 开头 → 误判为 in-tree → 用错的 HEAD（main 的）做 marker check → 阻断 s2 commit。**修复**: 改用 `path.relative()` + `..` 检查真实 containment，或显式 `path.resolve()` + 严格 segment 匹配。**已修（2026-05-06）**：`evaluation-gate.js` 提取 `isInsideProjectRoot(target, root)` 用 `path.relative()` + `!rel.startsWith('..') && !path.isAbsolute(rel) && rel !== ''` 判定，`isCrossRepoPush` 显式同路径短路 + 调用此 helper；新增 `__tests__/evaluation-gate.test.js` 22 用例全 pass。详见 `~/quant-deploy-s2/SESSION2.md` Follow-ups


## 2026-09-13 从 CLAUDE.md §错误教训日志 迁入（13 条，原文）

- [2026-04-19] 改 hook/skill/agent 不同步 CLAUDE.md → 规则被遗忘/重复发明 → §Triple-System 自演进铁律来源
- [2026-05-01] Claude 长期默认"快速能用"而非"长期正确" → §Long-term correctness 守卫机制全套（编码准则重排 + user-prompt-classify + fix-depth-check + set-mode --reset 加固）来源
- [2026-05-03] `evaluation-gate × pre-tool-escalate` 死循环阻塞 cross-repo push → 守卫互锁要画状态机，PreToolUse 看命令文本需考虑 `cd /elsewhere && cmd` 切 cwd 场景，marker 防 forge 同时留豁免出口 **【根因已修 2026-06-06：见 §错误教训日志 [2026-06-06] — 三 hook 改 segment-aware 匹配】**
- [2026-05-03] `.memory/` 嵌套+污染（3 层嵌套 + 8 子项目副本 + 209+915 noisy commit）→ `lib/project-root.js` 加 `isInsideMemoryRepo` walk-up 守卫；独立 git repo 嵌入主 repo 必须配 `.gitignore`，否则父级 hook 污染运行时状态进 memory repo
- [2026-05-05] Sub-agent `git stash` 干掉主 session staging — 16 文件 commit 丢失 → §多 Worktree / Sub-agent Git 隔离铁律来源；后台 agent 共享 worktree 内禁止 stash/checkout/reset/restore/add/rm
- [2026-05-20] Cross-session continuation commit (`04536bc`) 通过 KNOWN_ISSUES.md +30 行夹带 10+ 条 `⏩ 已修` 假声明，对应代码改动 0 个落地（双重 grep 验证 10/10 false-positive） → §Cross-Session Doc-vs-Code 配对铁律来源；项目级实现 `tools/git-hooks/commit-msg` 强制 commit message 含 `verified-by:` / `verified-files:` / `verified-via:` 三选一字段
- [2026-05-21] Claude 按 KNOWN_ISSUES `defer Wave 14 ~150 LOC 类型化重构` spec 文字盲目接受工作量,用户问"是否偶发?已修?胶水覆盖?"后才发现 30 LOC 持久化边界单点 check 同等覆盖且 ROI ~25-100× → §编码行为准则 Rule 4 来源 + `user-prompt-classify.js` IMPLEMENTATION_INTENT_PATTERNS 扩展(M-X/Wave/Phase/实施 关键词自动 inject 4 问反思,SSOT 在 Rule 4)
- [2026-05-20] `set-mode --reset standard --force && git commit ...` 同一 Bash invocation 链锁死 — `pre-tool-escalate.js` 把 `node set-mode.js standard` 命令字符串本身识别为 risk-signal 立刻又升 heavy，commit 启动时 evaluation-gate 阻断 → **铁律：reset mode + 后续 commit 必须拆成两个独立 Bash 调用**（同 Bash invocation 内执行的 `set-mode ; git commit` 会被 pre-tool-escalate 在 commit 命令检查时算成同一个 hot bash → mode 已重新升档）。Wave 4 commit 链实战遇 5+ 次，单独跑 set-mode 后另起一条 git commit 即可绕过。**深层根因**：pre-tool-escalate 命令字符串模糊匹配（"standard"/"escalate"/"reset" 等词都是 risk 关键词），应该排除自身脚本路径 `~/.claude/scripts/hooks/set-mode.js` 的命令调用（follow-up 加 allowlist）。**【follow-up 已实施 2026-06-06：见 §错误教训日志 [2026-06-06]。set-mode 段跳过 + git VCS 不再升档 + 段级 quote-strip 匹配，"reset+commit 必须拆两个 Bash 调用"的 workaround 不再必要】**
- [2026-06-05] 记忆系统诊断：项目 long-term 2026-04-27 后停止增长，初判"已停止增长（正常节流）"被用户追问后翻案 → 真根因三层：① **commit 路径无去重**（lessons 有 seen-lessons.json，commits 无等价机制）→ 多触发点（`[auto]` Stop + `[periodic]`）用 `git log --since=session_start` 全量窗口重复 append → weekly 86% 冗余；② 沉淀逻辑 `newLessons=0` 时 trim 删 commits-only section；③ **根本**：一个月修复教训全走 commit body / KNOWN_ISSUES，绕过 `**Lessons:** → 提取 → 沉淀`。修复 A+B+C1：`filterNewCommits` 去重 + 历史污染清理（67-86%→0%）+ `lesson-nudge` hook（fix commit 后提醒主动写，复刻 fix-depth-check"规则 0%→hook 守 100%"）。**元教训：诊断"为什么没增长"不能看 mtime 就下"正常"结论，要追"该增长却没输入"的上游断点**
- [2026-06-05] 系统级改动（A/B/C1 记忆修复）改完 ~/.claude 但未立即 push system repo → 中途 pull-all 的 system apply 用旧版覆盖 ~/.claude → A（对现有文件的修改：extract-lessons/stop-summary/periodic + doc 4 处）**全部丢失**，只有新建文件（lesson-nudge.js + test）和已 push 的 settings.json 幸存 → **铁律：系统级改动（尤其改现有文件）改完必须立即 `push-all` 进 system repo，不能留 ~/.claude 未推状态跨 pull-all 边界**（§自演进铁律"持久化"的并发覆盖维度）。检测：改 ~/.claude 后用户问"是否真 push"时，必须 grep system repo origin 端实际内容（不只看本地 ahead/behind），新建文件 vs 现有文件修改要分别验证（apply 不删新文件但覆盖现有文件修改）
- [2026-06-06] `pre-tool-escalate × evaluation-gate × careful-guard` 升档死循环根治（[2026-05-03]/[2026-05-20] follow-up 一直未实施，2026-06-05 单 session 触发 4+ 次）→ 三处共享同一深层根因：**对整条命令字符串做无语义子串匹配**。修复：① 新建共享库 `scripts/lib/command-scan.js`（`stripQuotedStrings` / `splitSegments` / `gitSubcommand` / `isSetModeInvocation`，20 单测）；② **pre-tool-escalate** 移除 git VCS 升档信号（commit/push/add 是版控机制非任务性质，routing.md 从未列为升档触发）+ 段级 quote-strip 匹配 + 跳过 `set-mode.js` 段（实施 [2026-05-20] 未做的 follow-up），22 单测；③ **evaluation-gate** `isCommitOrPush` 改 strip-quotes + segment + git-head 匹配，`--reason "...git push..."` 不再被当真 push 拦（+7 单测，含 hermetic subprocess 集成测试验证真 push heavy 无 marker 仍 exit 2）；④ **careful-guard** force-push 正则 `[^|;]*`→`[^|;&\n]*`，`git push && git branch -f` 不再跨命令误关联 `-f`（+5 单测）。**元教训：守卫互锁类 bug，三处独立打补丁不如先找共享根因（命令解析精度）抽一个 SSOT 解析库**。完成门三 utility 全过，无新增 drift/namespace Review。**Codex 对抗审查轮（NEEDS-WORK→已加固）**：发现首版 careful-guard `[^|;]*`→`[^|;&\n]*` 修复**过度矫正**——修了跨 `&&` 关联却漏放 `git push 2>&1 -f`（fd-redirect `2>&1` 的 `&` 截断了 force-flag 扫描，#4 我引入的回归）；set-mode skip + quote-strip 漏过 `--reason "$(terraform apply)"` 命令替换（#6 回归）；外加 2 个预存洞 `git --no-pager/-c push` 漏过 gate（#1）、`git \<换行>push` 行续（#2）。加固：careful-guard 改 redirect-aware `(?:[^|;&\n]|&(?=[\d>]))*`；command-scan `gitSubcommand` 跳 git 全局选项、`splitSegments` 行续 normalize + 命令替换内容提取为独立段 + `&` 重定向感知。#3(`isCrossRepoPush $VAR` 宽松豁免)/#5(`stripQuotes` 抹引号 flag)/#7(CI/deploy 文件无 Heavy 路径) 属我未触碰的路径或策略选择，flag 待独立处理。全 **174 测试**通过（careful-guard 42/command-scan 25/evaluation-gate 31/pre-tool-escalate 23）。**二级元教训：守卫正则收窄边界时，"排除命令分隔符 `&`" 与 "保留同命令内 token（fd-redirect 的 `2>&1`）" 必须同时验证，否则修一个误拦立刻换一个误放——对抗性 review 不可省**
- [2026-06-13] `pre-tool-escalate` hyphen-as-word-boundary 假阳性（[2026-06-06] 同子串匹配类的新实例，命令解析侧未覆盖路径名）→ 在 `quant-deploy` 仓库内每次 `cd /Users/hi/quant-deploy` / `git -C …/quant-deploy commit` 命令里，JS `\b` 把 `-` 当词边界，`/\bdeploy\b/` 匹配 `quant-deploy` 路径 → standard 被反复假升 heavy → evaluation-gate 拦 commit（单 session 触发 4 次，靠"相对路径 + commit msg 写文件避开 token 子串"绕过才提交成功）。根因：HEAVY_BASH_PATTERNS 单词 verb 用 `\b` 边界，对**含风险关键词子串的路径段**（项目目录名 `quant-deploy`）无免疫。修复：`deploy|terraform|kubectl|helm` 与 `migrate` 两组改 `(?<![\w-])…(?![\w-])` 边界——拒绝相邻 `-`/词字符，放行 `quant-deploy` 路径，仍匹配 `deploy`/`./deploy.sh`/`npm run deploy`/`terraform apply`。+6 单测（5 假阳性回归 + 1 `npm run deploy` 正向守卫不过度矫正），29 用例全过。完成门：M1 D2-D8 全 0（7 项全是 pre-existing D1 orphan 工具）/ M2 Hard 0、Review 未增。**元教训：风险关键词若是常见英文单词（deploy/migrate/auth），词边界必须 hyphen-aware——否则任何项目/路径名含该词就误升档；命令解析精度 SSOT 应把"路径段里的关键词子串"纳入测试矩阵**
- [2026-06-27] 一类反复 bug：逻辑字段长出第 2 个物理源/表示，新功能接新源不回收旧消费者 → 漂移 → SSOT 违反（单会话连发 4 个同形 bug：市场 bid/ask、腿仓位、entry_threshold、价差）→ §SSOT 单一访问器铁律来源（A）+ 全局 hook `ssot-source-guard.js`（组件层 useMarketMidPrice/proxy- + Rust strategy_configs.get 直读 → 软提醒，23 单测）+ CCHFT 项目级 B（封装 effective_config / useMarketPrice + ESLint）/ C（审计脚本 ssot-single-source.sh 接 pre-commit）。**元教训：SSOT 长期只是"原则"不强制 → 新功能作者不知 canonical 源在哪、顺手抓显眼但错的源；要把"错源不可达/对源不可绕过"做成 hook+lint+audit 三层守，复刻 fix-depth-check"规则 0%→hook 守 100%"**

## 原 §SSOT 单一访问器铁律 全文（2026-09-13 并入 Rule 0 后归档）

## SSOT 单一访问器铁律（强制）

> 2026-06-27 来源：一类反复出现的 bug —— 一个**逻辑字段长出 ≥2 个物理源/表示**，新功能接新源却不回收旧消费者（或反之）→ 两源漂移 → SSOT 违反 → bug。单会话曾连发 4 个同形 bug（市场 bid/ask 公共代理 vs 引擎 book、腿仓位 perp notional vs 引擎 mid×qty、entry_threshold deploy 烧录拷贝 vs ArcSwap 热更新、价差原始 vs 净）。`§一致性原则` 第 2 条"不重复 — 遵守 SSOT"是原则，本条是其**强制化**：让错源不可达 / 对源不可绕过。

**读取或新增任何被 ≥2 处消费的共享值前，三步**：
1. **先 grep 找 canonical 访问器** —— 有就用它，**绝不直接读原始源/底层 field**（`fetch`/`.get(field)`/直读 struct field）。
2. **若引入新表示/新源**，必须在**同一改动**里让旧 API 委托到新源（或回收所有旧消费者）。
3. **绝不留两个独立活源** —— "旧 map 留着 fallback 给其他读者"就是漂移温床。

**反模式**（说出/做出立即自检）：
- "这个值我直接 `fetch`/`.get(field)` 拿一下"
- "先加个新 hook/新端点取数，旧的不动"
- "热更新加 ArcSwap，旧 map 留着 fallback 给其他读者"

**强制/检测层**：① 全局 hook `ssot-source-guard.js`（PostToolUse Edit|Write，Always-on）在组件层加 `useMarketMidPrice`/`/proxy-` 或 Rust 直读 `strategy_configs.get` 时 stderr 软提醒（每会话每文件一次）；② 项目级可建审计脚本（注册表 + grep 禁源）接 pre-commit（CCHFT 实现见 `quant-deploy/scripts/audit/ssot-single-source.sh`）；③ 封装（错源设 private + 单 public 访问器）是最强但最重的手段，只对少数 SSOT-critical 字段做（§3 反过度设计：单源的别硬封装）。

