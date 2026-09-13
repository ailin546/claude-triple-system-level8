# Triple-System 自演进铁律 — 全文

> 2026-09-13 从 `~/.claude/CLAUDE.md` 迁入（Rule 0）。CLAUDE.md §Triple-System 自演进铁律 是入口。

## Triple-System 自演进铁律（强制）

> 2026-04-19 元反思：多次出现"改了 hook/skill/rule 但没同步 CLAUDE.md/文档 → 新 session 不知道 → 重复发明轮子 / 规则被遗忘"。这条铁律把"系统级改动必须持久化"从建议升级为硬约束。

**任何对 `~/.claude/` 下以下资源的改动都是"系统级"**:
- `scripts/hooks/*.js`（hook 行为改变）
- `skills/*/SKILL.md`（skill 流程改变）
- `agents/*.md`（agent 能力改变）
- `commands/*.md`（slash command 语义改变）
- `rules/**/*.md`（规则本身改变）
- `settings.json`（hook 注册/权限/模式映射改变）
- `CLAUDE.md`（本文件）

**系统级改动完成的三项硬要求**（缺一不可）:

| 层 | 文件 | 何时更新 |
|----|------|---------|
| 实现 | 对应的 `.js`/`.md`/`.json` | 改动本身 |
| **规则文档** | `~/.claude/CLAUDE.md` 或 `~/.claude/rules/*.md` | 加/改铁律、路由表、Agent 表、模式定义 |
| **可发现性** | 对应 `INDEX.md` 或 skill/agent 的 description 字段 | 新 session 启动时能 grep 到 |

**验证一项改动是否"持久化成功"**:
1. 关闭当前 session,开新 session
2. 问 Claude "这个机制/规则怎么工作"
3. 如果需要 Claude **重读代码** 才能回答 → **没持久化**,回去补文档
4. 如果 Claude 从 CLAUDE.md / rules / skill description 直接回答出来 → 通过

**运行时生效性的额外约束**(2026-04-19 踩坑发现):
- **新增 agent 文件**(`~/.claude/agents/*.md`)Claude Code **不会热 reload**,当前 session 的 Task tool 不认识新 name。必须**重启 Claude Code CLI**(`/quit` + `claude` 重开)才生效
- **新增 hook**(`~/.claude/scripts/hooks/*.js`)+ 在 `settings.json` 注册 → 下一次该 hook 类型触发时生效(比如 PreToolUse Bash 下一次 Bash tool 调用就生效)
- **新增 skill** 文件立即生效(SKILL.md 是 on-demand read)
- **CLAUDE.md / rules/*.md** 改动:当前 session 已加载旧版,新 session 才会读到新版(除非手动 `/memory reload` 之类)

所以"持久化"不等于"运行时生效"。两件事要分开验证:① 新 session 读文档能懂(持久化 ✓)② 当前 session 要不要重启(运行时 ✓)。

**反模式（禁止）**:
- "改了 hook 就 claim done,不改 CLAUDE.md" → hook 行为和文档约定的不一致 → 未来 debug 地狱
- "新 skill 放 skills/,不在 CLAUDE.md §工作流程 里 link" → 新 session 不知道它存在 → skill 被边缘化
- "改了 commands/verify.md 的 `pre-pr` 分支行为,不同步 CLAUDE.md Quick Commands 表" → 用户看旧表
- "给 agent 加新能力,不更新 agents 路由表" → 任务路由不到新 agent
- "口头跟自己说'记得 XXX'" → 下个 session 立即失效

**与错误教训日志的区别**:
- **错误教训日志**: "历史某次错了,下次别犯" → 追加条目式
- **本铁律**: "改系统配置 = 必须同步多处文档" → 验证式硬约束

### 作用域判定（系统级 vs 项目级，每条规则只写一处）

改动前先判定归属,避免两个 CLAUDE.md 写重复规则:

| 改动落在哪里 | 归属 | 写入文档 |
|-------------|------|---------|
| `~/.claude/scripts/hooks/*` | 系统级 | `~/.claude/CLAUDE.md` |
| `~/.claude/skills/*/SKILL.md` | 系统级 | `~/.claude/CLAUDE.md` |
| `~/.claude/agents/*.md` | 系统级 | `~/.claude/CLAUDE.md` |
| `~/.claude/commands/*.md` | 系统级 | `~/.claude/CLAUDE.md` |
| `~/.claude/rules/**/*.md` | 系统级 | `~/.claude/CLAUDE.md` |
| `~/.claude/settings.json` | 系统级 | `~/.claude/CLAUDE.md` |
| `PROJECT/CLAUDE.md` / `PROJECT/docs/*` | 项目级 | `PROJECT/CLAUDE.md` |
| `PROJECT/.claude/skills/*`（项目级 skill） | 项目级 | `PROJECT/CLAUDE.md` |
| 项目内代码/策略/监控/修复 | 项目级 | `PROJECT/CLAUDE.md` |
| 跨项目通用工具（脚本、库） | 系统级 | `~/.claude/CLAUDE.md` |

**判定原则**:
- **"谁承载"决定"谁文档化"** — 改动文件在哪个作用域,规则就写在哪个作用域的 CLAUDE.md
- **禁止跨作用域重复** — user-level 铁律不抄到 project CLAUDE.md,反之亦然
- **允许单向引用** — 项目级规则可以引用 "详见 `~/.claude/CLAUDE.md §X`",但不复制内容
- **边界案例**: 某个规则同时适用系统和项目级 → 写在 user-level(更广),项目级只 link

**判定歧义示例**:
- 改 `~/.claude/skills/evaluation-loop/SKILL.md` → 系统级(工具本身)
- 改 "CCHFT 项目的 Heavy 任务必须走 evaluation-loop" → 项目级(项目纪律)
- 两者分别在两个 CLAUDE.md,互不重叠

**关联**: 项目级 CCHFT 有同构规则在 `/home/ubuntu/quant-deploy/CLAUDE.md §十二`,作用域严格互补(user-level 管 Claude Code 基础设施,project-level 管 CCHFT 代码/监控/修复)。

### 通用文档化触发（重要内容 / 长时间阻碍，2026-07-12 用户指令）

以下三类事件发生时，**当次会话内**落文档（不是"以后补"）：

1. **重要新增/改动** — 系统级（`~/.claude`）走本铁律三项硬要求；项目级走 PROJECT CLAUDE.md 对应持久化章节（CCHFT = §十二 + doc-sync commit gate）。此处只声明触发，不复制规则。
2. **长时间阻碍**（任一为真即触发）：① 同一问题卡住 ≥30 分钟无实质进展 ② 问题跨会话仍未解 ③ 被外部依赖阻塞（等 API/审批/环境）。动作：项目问题 → 项目 KNOWN_ISSUES 或 `reports/T-*` follow-up 记录**现象 + 已试路径 + 当前假设**；系统/流程问题 → 本文件 §错误教训日志 或 `**Lessons:**` 格式（走自动沉淀管道）。解决后回同一 entry 补根因。动机：卡点不落文档 = 下个 session 从零重走同一条死路（"重复发明"反模式的时间维度版本）。
3. **重要讨论产出/决策（非代码）** — 用 `**Decisions:**` 格式写出（Stop hook 自动提取进记忆）；影响长期方向的写进对应文档（ADR / OPERATIONS / 本文件）。

判据"重要"与持久化验证同源：**换一个新 session 会被再次问起、且需要重读代码/重走弯路才能回答 → 就是重要，必须落文档**。

