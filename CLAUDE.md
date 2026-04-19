# Triple-System Development Framework

> **所有内容用中文回复。**

## 系统架构

| Layer | System | What It Provides |
|-------|--------|-----------------|
| **Infrastructure** | ECC | Hooks, memory, learning, 28 commands, common rules |
| **Process** | Superpowers | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | Agency Agents | 26 active agents with domain knowledge |

## 工作流程

```
User Request
    │
    ├─► ECC Infrastructure (自动触发)
    │   SessionStart → 加载上次会话状态
    │   PreToolUse → 危险命令守卫、编辑冻结
    │   PostToolUse → 自动格式化、类型检查、漂移检测
    │   PreCompact → 上下文压缩前保存状态
    │   Stop → 保存状态、提取模式、追踪成本、记忆整合
    │
    ├─► Superpowers Process (流程纪律)
    │   brainstorming → 探索需求、生成设计文档
    │   writing-plans → 拆解为TDD小任务
    │   test-driven-development → 铁律：先写失败测试
    │   systematic-debugging → 4阶段根因分析
    │   verification-before-completion → 跑验证才能说完成
    │
    └─► Agency Agents Expertise (专业视角)
        按任务类型自动路由到对应领域专家 agent
```

## 优先级

1. **用户显式指令** — 最高优先
2. **ECC hooks & rules** — 基础设施（100% 可靠）
3. **Superpowers skills** — 流程/工作流（HOW）
4. **Agency Agents personas** — 专业知识/角色（WHO）

## 任务模式路由

> 详细规则见 `~/.claude/rules/routing.md`（自动加载）。

**推荐命令链**：
- Fast：直接做 → `/verify`
- Standard：`/specify` → `/plan` → 实施 → `/verify`（对照 specify 验收条件检查）
- Heavy：`/specify` → `/plan` → `/tdd` → 实施 → `evaluation-loop` → `/code-review` → `/verify`

## Agent 路由

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| AI/ML | `engineering-ai-engineer` | Code review | `engineering-code-reviewer` |
| Architecture | `engineering-software-architect` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |
| DB optimization | `engineering-database-optimizer` | Git workflow | `engineering-git-workflow-master` |
| Technical docs | `engineering-technical-writer` | Performance | `testing-performance-benchmarker` |

## 模型自动选择

Spawn 子 agent 时根据当前模式（`.claude/.task-mode`）选择模型：

| Agent 类别 | Fast | Standard | Heavy |
|-----------|------|----------|-------|
| critical-reasoning（planner, architect） | opus | opus | opus |
| orchestrator | sonnet | opus | opus |
| review（code-reviewer, security-*） | sonnet | opus | opus |
| development（tdd-guide, build-*, frontend, backend...） | sonnet | sonnet | opus |
| worker（doc-updater, refactor-cleaner, e2e-runner...） | haiku | sonnet | sonnet |

查询：`node .claude/scripts/hooks/get-model.js <agent-name>`
映射逻辑：`.claude/scripts/lib/model-map.js`
覆盖：`MODEL_MAP_OVERRIDE=planner:sonnet,doc-updater:opus`

## 风险控制

全权限 + hook 守卫模式：
- hooks 配置在用户级 `~/.claude/settings.json`，所有项目共享
- `careful-guard` — 阻断破坏性命令
- `freeze-guard` — 编辑范围锁
- `pre-tool-escalate` — 高风险操作自动升档
- `evaluation-gate` — Heavy 模式下 `git commit/push` 必须先有 evaluation-loop pass marker(2h TTL),否则 exit 2 block
- `stop-summary` 的 Proof of Work 扩展 — 每次 Stop 追加一行 JSON 到 `~/.claude/state/proof-of-work.jsonl`(session audit schema 见 `scripts/lib/proof-of-work.js`)

降级策略：Hook 失败时 Always-on 记 warning 继续，Standard+ 降为 Fast，Heavy 降为 Standard。

## Quick Commands

| Command | Purpose | 适用模式 |
|---------|---------|---------|
| `/specify` | 定义任务宪法（范围+原则+验收条件） | Standard+ |
| `/plan` | 规划实现（强制输出 AC） | Standard+ |
| `/tdd` | 测试驱动开发 | Standard+ |
| `/verify` | 验证检查 | 所有模式 |
| `/code-review` | 代码审查 | Standard+ |
| `/build-fix` | 修复构建 | 所有模式 |
| `/save-session` / `/resume-session` | 保存/恢复会话 | Standard+ |
| `/careful` | 危险命令守卫开关 | 所有模式 |
| `/freeze` / `/unfreeze` | 编辑范围锁 | 所有模式 |

全部命令见 `~/.claude/commands/` 和 `~/.claude/skills/`。

## 记忆系统（双层）

```
~/.memory/                          ← 全局（跨项目）
├── index.md                        ← 项目索引（hook 自动维护）
├── today.md                        ← 跨项目当日（仅 lessons + decisions）
├── weekly.md                       ← 近 2 周归档
└── long-term.md                    ← 永久知识（自动沉淀 Lessons + Decisions）

PROJECT/.memory/                    ← 项目级（各项目独立）
├── today.md / weekly.md / long-term.md
```

**自动采集（双触发点，共享 extract-lessons.js）：**
- **PreCompact hook**（pre-compact.js）— compact 前提取，防止长会话教训丢失（标记 `[compact]`）
- **Stop hook**（stop-summary.js）— 会话结束时提取，兜底保障（标记 `[auto]`）
- 从 transcript JSONL 提取 `**Lessons:**` section 下的 `→` / `->` 教训
- 从 git log 提取 session 期间的 commits（fix 类型含 body）
- 门控：无 commits + 无 lessons + 无 decisions → 不记录（零噪音）
- 去重：`seen-lessons.json` 持久化已提取的 lesson keys（7 天 TTL），compact 已提取的 Stop 时自动跳过

**三级流转（全自动）：**
- today.md →[次日]→ weekly.md →[2周后]→ long-term.md（仅 Lessons + Decisions）
- 流水账自动丢弃，只有教训和决策沉淀到永久知识库
- `promoteLessons()` 将出现 2+ 次的教训推广到 CLAUDE.md

**Claude 写教训的格式**（便于 Stop hook 自动提取）：
```markdown
**Lessons:**
- 问题描述 → 正确做法
```

**详细设计文档**见 `~/.claude/rules/common/workflow.md` 的"记忆系统"段。

## 编码行为准则

### 精准改动（Surgical Changes）

每一行改动必须直接追溯到用户请求：
- **不顺手重构**周边代码、注释、格式
- **不加**未要求的功能、参数、错误处理
- **不删**与本次任务无关的死代码（发现了可以提出，但不动手，等用户确认）
- 匹配现有代码风格，即使你会用不同写法
- 你的改动产生的孤立 import/变量/函数 → 清理；已有的死代码 → 不碰

**自检**：diff 中每一行能否直接指向用户请求？不能 → 删掉那行。

### 过度设计自检（仅适用于新功能开发）

写完代码后问自己：**"一个高级工程师会说这太复杂了吗？"**
- 如果 200 行能用 50 行解决 → 重写
- 单次使用不要写抽象类/策略模式/工厂
- 不加没要求的灵活性、可配置性、泛型参数
- 不为不可能的场景写防御代码

### 修复问题时：根因优先，不走捷径

**此规则优先级高于"精准改动"和"过度设计自检"。**

修复 bug 和改进架构时，不追求"最小改动"或"最快修复"：
- **先理解根因**，不要看到症状就打补丁
- **修根因而非症状** — 如果根因是架构设计问题，就改架构，不在上层绕过
- **不提议"快速修复"** — 不说"最小修复是..."，而说"根因是...，彻底解决方案是..."
- **宁可多改几个文件，也不留技术债** — 一次改到位比三轮补丁好
- **修完要能回答：同类问题不会再发生** — 如果还能发生，就没修完

| ❌ 过度设计 | ✅ 正确做法 |
|------------|-----------|
| 为单个折扣写 DiscountStrategy 抽象基类 | 一个函数 `calculate_discount(amount, percent)` |
| 加 merge/validate/notify 3 个没要求的参数 | 只做被要求的：存数据库 |
| 为所有可能的输入类型写泛型 | 用实际的具体类型 |

### 模糊需求处理

遇到多种合理解读时，**列出选项让用户选，不要默默选一种**：

```
这个需求有几种理解：
1. [解读 A] — 影响范围/工作量
2. [解读 B] — 影响范围/工作量
3. [解读 C] — 影响范围/工作量

最彻底的方案是 [X]，最简方案是 [Y]，你倾向哪种？
```

### /plan 验证格式

`/plan` 输出的每一步必须附带验证检查点：

```
1. [步骤描述] → verify: [具体检查命令或条件]
2. [步骤描述] → verify: [具体检查命令或条件]
3. [步骤描述] → verify: [具体检查命令或条件]
```

明确的成功标准让 agent 可以独立循环验证，模糊标准（"让它工作"）需要反复澄清。

## 一致性原则

1. **先质疑假设，再动手** — 从事实出发
2. **不重复** — 遵守 SSOT
3. **不破坏** — 引入新依赖或破坏现有接口前，必须获得用户确认
4. **Outcome 优先** — 先确认用户要的结果（不是功能），再分析怎么做。诊断问题时用证据不用猜测 — 加日志、跑测试、看数据，禁止连续给出未经验证的不同猜测

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

## 错误教训日志

> 格式：`- [日期] 错误描述 → 正确做法`

<!-- 新错误追加在此行下方 -->

- [2026-03-25] 两个 CLAUDE.md 不同步导致规则冲突 → 改一处必须同步另一处
- [2026-03-25] Hook 未做环境检查，缺依赖时阻塞整个流程 → hook 必须优雅降级
- [2026-03-30] Hook 的 mode gate catch 分支 fallthrough → catch 中必须也做 stdin 透传 + exit
- [2026-03-30] Hook 不应 dump 用户原始消息到记忆文件 → hook 只记元数据
- [2026-04-19] 改 hook/skill/agent 却不同步 CLAUDE.md → 新 session 不知道 → 规则被遗忘/重复发明 → 必须遵守"Triple-System 自演进铁律",改系统级资源后同步多层文档
- [2026-04-19] Heavy 任务绕过 evaluation-loop 自证 PASS → 正是文章警告的"病态乐观"反模式 → Heavy 模式下的 4+ 文件改动必须 `/specify → /plan → evaluation-loop`,不允许 inline 自证;2026-04-19 晚补 `evaluation-gate.js` hook 在 commit 时硬阻断
- [2026-04-19] 独立 Reality Checker 审查抓到 evaluation-gate marker 可被 Claude 伪造 + Reality Checker agent 对 Rust 项目不适用(STEP 1 全是 Web 命令)→ marker schema 加 `git_head`/`evaluator_agent_id`/`verdict_summary(≥10字符)` 强制校验,evaluation-gate hook 检查 marker.git_head == current HEAD 自动失效;新增 `testing-reality-checker-systems.md` agent(Rust/backend 版),evaluation-loop Step 4 按项目类型路由
