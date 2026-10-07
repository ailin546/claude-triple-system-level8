# Claude 工作规则（用户级）

> **所有内容用中文回复。**
> 规则分层：本文件 = 每会话必知的工作方式；`rules/common/` = 工作流 / 质量安全 / agent / hooks；`on-demand/` = 按需读的长文（自演进清单、审计协议、git 隔离、编码纪律、sessions board、教训归档）。2026-10-07 起 Fast/Standard/Heavy 模式机器、提醒型 hook、自建记忆轮转、Board 模式已删（`quant-deploy/reports/harness-slim-plan-2026-10-07.md`）。

## 工作方式

- 一句话能描述 diff 的任务直接做；多文件、不熟悉的代码、方案未定 → 原生 plan mode；每步带 `→ verify: [命令/条件]`。
- 大需求先让 Claude 用 AskUserQuestion 访谈，写完 SPEC 再新开会话实施。
- 完成声明必须附最新、相关的验证证据；不能运行的部分明确披露。可度量改进用原生 `/goal` 或 Stop hook 门，有基线、指标、验证命令才做循环。
- Review 默认一次；只有修复 Critical/High 后允许一次复核；第三次及以后需用户明确要求。审查带出的相邻小问题先讲清不修的后果，让用户定范围。
- 子代理：机械 / 检索型 spawn 时传 `model: sonnet`（不传 = 继承主会话最贵档）；裁决 / 审查型才继承。同一子系统多轮追问用 SendMessage 续同一个 agent。并发后台代理 ≤ 6–7。
- 多种合理解读时列选项给用户选，不默默选一种。

## 优先级

1. 用户显式指令 2. hooks（`rules/common/hooks.md`，6 个守卫型）3. `rules/common/` 工作流 4. 专长 agent（下表）。

## Agent 路由（专长 agent，Capital 名，按需）

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `Frontend Developer` | Security audit | `Security Engineer` |
| API/Database | `Backend Architect` | Code review | 主 agent 单次 Review Gate；高风险派 `code-reviewer` |
| Architecture | `Software Architect` | Prototype | `Rapid Prototyper` |
| Technical docs | `Technical Writer` | Rust | `Rust Engineer` |
| Reality check | `Reality Checker` / `Systems Reality Checker` | 全局审计 | `on-demand/audit-protocol.md` |

## Codex 调用规则（强制）

任何 Codex / GPT 调用（rescue、review、对抗审查、second opinion、委派复杂改动）必须走 `openai-codex` 插件链，不得绕开。

| 用户意图 | 入口 |
|---------|------|
| 卡住 / 二次实现 / 深度根因 / 委派复杂改动 / 模型自动派的只读对抗审查 | `Agent(subagent_type="codex:codex-rescue")`（`--wait` + `--prompt-file`，不传 `--write` 即只读） |
| 用户手动审查 | `/codex:review` `/codex:adversarial-review`（`disable-model-invocation`，模型不能调） |
| 安装 / 认证 / 查询 / 取回 / 取消 | `/codex:setup` `/codex:status` `/codex:result` `/codex:cancel`（用户调） |

1. 唯一执行入口：所有 `task` 由 `codex:codex-rescue` 经 `codex-companion.mjs task` 转发；主 agent 不得直接 Bash 跑 `codex` / `codex-companion.mjs`。
2. rescue agent 调用前按 `codex:gpt-5-4-prompting` 写 prompt（XML block、单任务、明确 done 标准）；拿到 stdout 后按 `codex:codex-result-handling` 原样呈现（保留 verdict / findings / severity 顺序，不自动应用修复，失败不补刀）。
3. rescue agent 是转发器不是编排器：一次 task、原样返回，不自己改码、不独立分析、失败不切换到 Claude 侧实现。
4. 资金路径（下单 / 撤单 / 成交入账 / 结算 / 风控门 / 余额与预留 / 对冲执行）改动：最后一次提交之后、推送之前，主 agent 自动派一次只读对抗审查（task 写明 worktree 绝对路径与提交范围）。Codex 不可用（额度 / 认证 / 模型被拒）如实报告，不拿 Claude 侧审查顶替。
5. 不写新 hook / script 包装 Codex；插件 helper 已处理 runtime、auth、session。

## 编码行为准则

**Rule 0 只替换，不并存**（凌驾于下面三条）：任何新增的持久对象——代码路径、闸、字段、旋钮、测试、文档条目、注释段、脚本、hook、报告、记忆条目、worktree——加入前必答「它替代了什么」。合格答案只有两种：① 替代了 X，且同一改动内删除 X；② 它是事实 F 的唯一的家，且 grep 证明 F 现在没有家。答不出 → 不加。修一个错值时答案是「替代了错值」，什么都不附加。数据源（读共享值先 grep canonical 访问器；新源必须同一改动内让旧 API 委托过去）、代码对象、文档落点（同一事实只保留一个人工维护来源）、抽象（单次使用不写抽象 / 策略 / 工厂）都是它的例子。修类别 bug 时扫兄弟适配器不算 scope creep。项目级执行点：CCHFT `tools/git-hooks/commit-msg` Gate 0（新增持久对象的 commit 必带 `replaces:` / `home:`）。

三规则按优先级：① 根因优先（fix / bug / 事故时主导）② 精准改动（非 fix 任务主导）③ 过度设计自检（新功能）。判定不清 → 根因优先。

**1. 根因优先**（fix / bug / 异常 / 测试失败）：强制三步 ① 根因分析（设计问题 vs 实现 bug）② 方案评审（消除根因还是绕过症状？引入新阻塞？更简单方案？）③ 验证（≥ 3 分钟持续性测试）。修完要能回答「同类问题不会再发生」。禁止症状级措辞："10 分钟小改" / "minimal fix" / "顺手修了" / "先这样" / "应该没问题"。症状修复只允许救火，且显式标「症状修复，根因 = X，根因修复在 Y」。修报告点只把问题往前挪：先写不变量与接受的残余风险、枚举全部违反点，复审只查违反不变量。

**2. 精准改动**（非 fix）：每行 diff 直接追溯用户请求；不重构周边、不加未要求功能、不删无关死代码（提议但不动）、匹配现有风格。

**3. 过度设计自检**（新功能）：并入 Rule 0。写完问「高级工程师会嫌复杂吗」。

**4. 实施 spec / M-X / Wave / backlog 引用类任务前先答四问**：① 偶发还是反复 ② 是否已部分修过（`git log -S`）③ spec 的 LOC / 估算是否还准确 ④ 下游 SSOT 胶水或单点 check 能否覆盖同样意图。报告答案与推荐方案后再估算工作量；用户说「按 spec full 实施」则跳过。

**动手前自查**：新增系统级文件、"应该存在但还没有"假设、建议 missing 防御机制、长会话切新任务——任一为真先跑 `git log --since="30 minutes ago" --all --oneline`，重叠则读对方 commit 决定接受 / 补充 / 沟通。

**一致性原则**：先质疑假设再动手；不重复（Rule 0）；引入新依赖或破坏现有接口前取得用户确认；Outcome 优先——诊断用证据不用猜测，禁止连续给未经验证的不同猜测。

## 记忆

- 项目记忆 = 原生 auto memory，目录在 `PROJECT/.memory/auto/`（各机器项目 `.claude/settings.local.json` 的 `autoMemoryDirectory`），Claude 与 Codex 共用，协议 `~/.claude-system/shared/memory/PROTOCOL.md`。索引 `MEMORY.md` 一条一行 ≤ 160 字节、≤ 190 行，细节进主题文件。
- 跨项目教训的家是 `~/.memory/long-term.md`，需要时读，写入打 `[Claude]` 标签。
- 同步只经 `quant-deploy/scripts/pull-all.sh` / `push-all.sh`（只发布 .md、拒绝冲突标记、冲突即停），没有 hook 自动推拉。
- 会话恢复用原生 `/resume`、`/rename`。

## 多 Worktree / Sub-agent Git 隔离（强制）

> 2026-05-05 事故：后台 agent 在共享 worktree 内 `git stash` / `pop` 吞掉主 session 的 staging，16 个文件从 commit 丢失。全文 `on-demand/git-isolation.md`。

1. 共享 worktree 内的 sub-agent 禁止任何改 index / working tree 的 git 操作：stash、checkout / switch、reset / restore、add / rm / mv、commit / revert / cherry-pick / rebase / merge、clean。只允许 read-only：log / show / diff / status / rev-parse / cat-file / ls-files / blame / config --get。
2. 需要在别的 ref 上跑测试用 `Agent(isolation: "worktree")`。删 worktree 前先 `git log` 枚举未 pick 的提交。
3. spawn 修改类 agent（含 codex review、reality checker、code-reviewer）的 prompt 末尾附：「约束：你在主 session 共享的 git worktree 内运行。禁止 `git stash` / `git checkout <ref>` / `git reset` / `git restore` / `git add` / `git rm` / `git commit` 等修改 index/working-tree 的操作。只允许 read-only：`git log` / `git show` / `git diff` / `git status` / `git rev-parse`。需要 baseline 对比时报告 "需要 isolation worktree"。」
4. 多 Claude session 并行跑实例：`git worktree add` 隔离 + 端口 / worker_id / DB / 日志独立；`~/.cchft-secret`、`~/.memory/` 全局共享会互踩。

## Cross-Session Doc-vs-Code 配对（强制）

> 2026-05-20 事故：收尾 commit 在 KNOWN_ISSUES 夹带 10+ 条 `⏩ 已修`，对应代码 0 行。全文 `on-demand/doc-code-pairing.md`。

接手「另一会话已完成你继续收尾」时，code-only commit 与 docs-only commit 分开；任何 `⏩ 已修` / `✅ DONE` 必须能在同 PR 或先前 PR 内 grep 到对应符号，commit 三选一 `verified-by:` / `verified-files:` / `verified-via:`（CCHFT commit-msg hook 强制）；不信 continuation commit 的自述，自己 grep；未 merge main 的分支不得标已修。

## 系统级改动（改 `~/.claude/` 下的 hook / skill / agent / command / rule / settings / 本文件）

- 三项硬要求缺一不可：① 实现 ② 规则文档（本文件或 `rules/*.md`）③ 可发现性（`skills/INDEX.md` 或 description）。验证：新会话不重读代码能答出机制怎么工作。
- 运行时生效 ≠ 持久化：新 agent 文件需重启 CLI；新 hook 下次触发生效；skill 立即生效；本文件 / rules 只对新会话生效。
- 改完当次会话跑完成门（M1 drift / M2 namespace / M3 snapshot / M4 `sync_workflow.py --check`，细则 `on-demand/self-evolution.md`）并 `quant-deploy/scripts/push-all.sh`；改受保护入口要兼容评审并同提交刷新基线。
- 作用域：文件在 `~/.claude/` 下写本文件，在项目内写项目 CLAUDE.md；禁止跨作用域复制，允许单向引用。重要新增 / 改动、同一问题卡 ≥ 30 分钟、重要非代码决策当次会话内落文档。

## Sessions Board（多 Claude session 协调）

`~/.claude/state/sessions-board.md`：session 开始、改仓库级共享文件、启占端口进程、spawn 修改类后台 agent、`git stash/reset/commit` 前、`git status` 有不认识修改时必读；开始写 entry（worktree + doing + touching + holds + don't touch + next），结束剪到 `sessions-board-history-2026.md`。Entry schema 与清理规则 `on-demand/sessions-board.md`。
