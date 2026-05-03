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

## Agent 路由（专长 agent，capital 名）

> Spawn 用 frontmatter 的 canonical name（Capital Phrase 风格）。基础设施 agent（lowercase: `planner`、`tdd-guide` 等）见 `~/.claude/rules/common/agents.md`。

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `Frontend Developer` | Security audit | `Security Engineer` |
| API/Database | `Backend Architect` | CI/CD/Docker | `DevOps Automator` |
| AI/ML | `AI Engineer` | Code review | `Code Reviewer` |
| Architecture | `Software Architect` | Full project | `Agents Orchestrator` |
| Prototype | `Rapid Prototyper` | Tests | `API Tester` |
| DB optimization | `Database Optimizer` | Git workflow | `Git Workflow Master` |
| Technical docs | `Technical Writer` | Performance | `Performance Benchmarker` |
| Rust | `Rust Engineer` | Reality check | `Reality Checker` / `Systems Reality Checker` |

## Codex 调用规则（强制）

> 任何形式的 Codex / GPT-5.4 调用（rescue、review、adversarial-review、second opinion、深度诊断、复杂代码任务委派）**必须**走 `openai-codex` 插件的 skill/agent 链，不允许绕开。

### 调用矩阵

| 用户意图 | 入口 | 链路 |
|---------|------|------|
| 卡住/二次实现/深度根因/委派复杂改动 | `Agent(subagent_type="codex:codex-rescue")` 或 `/codex:rescue` | rescue agent → `codex-cli-runtime` skill → `codex-companion.mjs task` |
| 代码审查（Codex 视角） | `/codex:review` | helper `review` 子命令 |
| 对抗性审查 | `/codex:adversarial-review` | helper `adversarial-review` 子命令 |
| 检查/安装/认证 Codex | `/codex:setup` | helper `setup` 子命令 |
| 查询、取回、取消运行 | `/codex:status` `/codex:result` `/codex:cancel` | helper 对应子命令 |

### 强制约束

1. **唯一执行入口**：所有 Codex `task` 调用必须由 `codex:codex-rescue` 子 agent 通过 `codex-companion.mjs task` 转发；主 agent **不得**直接 `Bash` 执行 `codex` CLI、`codex-companion.mjs`、或手写 `git`/`gh` 拼接 Codex prompt。
2. **Prompt 写作**：rescue 子 agent 在调用前撰写/重写 Codex prompt 时**必须**应用 `codex:gpt-5-4-prompting` skill（XML block 结构、单任务、明确 done 标准）。这是唯一允许的 Claude 侧加工。
3. **结果呈现**：拿到 helper stdout 后**必须**应用 `codex:codex-result-handling` skill（保留 verdict/findings/severity 顺序、不自动应用 review 修复、失败不补刀重写）。
4. **Forwarder 纪律**：rescue agent 是转发器**不是**编排器 — 一次 `task` 调用，原样返回 stdout，禁止自己改代码、做独立分析、或在 task 失败时切换到 Claude 侧实现。
5. **不重新发明**：不要写新 hook/script 去包装 Codex；插件 helper 已经处理 runtime、auth、session 复用。

### 反模式（禁止）

- 主 agent 直接 `Bash: codex exec "..."` 或 `Bash: node codex-companion.mjs task ...` — 应该 spawn `codex:codex-rescue` agent
- 不读 `gpt-5-4-prompting` 就把用户原文塞给 Codex
- Codex 返回 review findings 后不等用户确认，自动开始修 — `codex-result-handling` 明令禁止
- Codex 调用失败后退化为"那我自己来" — 必须报告失败并停止
- 在 `codex:codex-rescue` 之外的 agent/skill 里调用 `task` helper

### 可发现性

- 系统级 skill list（SessionStart 自动加载）已包含 `codex:rescue` `codex:setup` `codex:codex-cli-runtime` `codex:gpt-5-4-prompting` `codex:codex-result-handling`
- 系统级 agent list 已包含 `codex:codex-rescue`
- 本节是 SSOT，项目级 CLAUDE.md 不复制，只单向引用 `~/.claude/CLAUDE.md §Codex 调用规则`

## 模型自动选择

Spawn 子 agent 时根据当前模式（`.claude/.task-mode`）选择模型 — 5 类 agent × 3 档模式映射 haiku/sonnet/opus。

**完整映射表 + 使用规则**详见 `~/.claude/rules/routing.md` §模型自动选择（SSOT）。
**触发点 + 模型能力参考**详见 `~/.claude/rules/common/infrastructure.md` §Model Selection Strategy。

查询：`node .claude/scripts/hooks/get-model.js <agent-name>`

## 风险控制

全权限 + hook 守卫模式：
- hooks 配置在用户级 `~/.claude/settings.json`，所有项目共享
- `careful-guard` — 阻断破坏性命令
- `freeze-guard` — 编辑范围锁
- `pre-tool-escalate` — 高风险操作自动升档
- `evaluation-gate` — Heavy 模式下 `git commit/push` 必须先有 evaluation-loop pass marker(2h TTL),否则 exit 2 block
- `user-prompt-classify` — fix/bug 关键词自动升 standard + 首条 prompt 注入深度评估提示
- `fix-depth-check` — fix-only commit 缺根因解释 → stderr 软警告
- `set-mode.js --reset` 加固 — 必须 `--reason` + cooldown + 可疑词阻断（防 evaluation-gate 零摩擦逃生）
- `stop-summary` Proof of Work 扩展 — 每次 Stop 追加 JSON audit 到 `~/.claude/state/proof-of-work.jsonl`
- `lib/project-root.js` `.memory/` 嵌套守卫 — `getProjectRoot()` 检测 cwd / git toplevel 落在 `.memory/` 内时自动 walk-up 到第一个非 `.memory` 祖先，防止 hook 在 `.memory/` 内创建 `.memory/.memory/` 嵌套副本（2026-05-03 新增，背景：项目级 8 处 + 全局 1 处嵌套副本）

完整 hook 行为表 + 模式升档机制见 `~/.claude/rules/common/infrastructure.md` §Hooks System / §模式升档机制。

降级策略：Hook 失败时 Always-on 记 warning 继续，Standard+ 降为 Fast，Heavy 降为 Standard。

### Long-term correctness 守卫机制（2026-05-01 新增）

> **背景**: 2026-04-30 用户元反思发现 Claude 长期默认"快速能用"而非"长期正确"，三大结构性原因：① task-router 默认 fast；② evaluation-gate 阻断时 `set-mode.js --reset` 是零摩擦逃生通道；③ "精准改动"规则压过"根因优先"规则；④ 没有任何 hook 检测"症状修复 vs 根因修复"。本节是反向力。

| 机制 | 守什么 | 怎么守 |
|------|--------|--------|
| CLAUDE.md §编码行为准则 重排 | 价值观默认 | 根因优先放第一条（fix/bug 任务），精准改动放第二条（仅非 fix 任务），过度设计自检放第三条 |
| user-prompt-classify hook | session 起点 / 用户意图 | 首条 prompt 注入深度评估提示；fix/bug 关键词自动升 standard |
| fix-depth-check hook | commit 时 | fix-only 消息 → 软警告补根因 |
| set-mode --reset 加固 | 模式逃生通道 | reason 强制 + cooldown + 可疑词阻断 |
| 错误教训日志 [2026-05-01] | 历史回放 | 见本文件末尾 |

**反模式（一旦触发应立刻自我警觉）**：
- 自己说出禁止的"症状级措辞"（详见 §编码行为准则·1 末段清单）
- 被 evaluation-gate 阻断时第一反应是 `--reset` 而不是 `/evaluation-loop`
- bug 报告先想"如何最小修复"而不是"为什么这个 bug 可能"
- 修了 schema 漂移类问题但不查"为什么没被任何检查抓到"
- 把任务切碎成"做一段 → 报告 → 等批准"的小循环（Discord 格式陷阱）

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
| `/codex:rescue` | 委派复杂任务/根因/二次实现给 Codex（详见 §Codex 调用规则） | 所有模式 |
| `/codex:review` `/codex:adversarial-review` | Codex 视角代码/对抗审查 | Standard+ |
| `/codex:setup` `/codex:status` `/codex:result` `/codex:cancel` | Codex 运行时管理 | 所有模式 |

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

**自动采集（三触发点，共享 extract-lessons.js）：**
- **Periodic hook**（periodic-memory.js）— 每 30 分钟从 transcript 提取，保障长期不关闭的 channel 会话（标记 `[periodic]`）
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

> **顺序约定**：以下三条规则按**优先级**排列。修 bug / 处理事故 / 改进架构时，**根因优先**压过其余两条。新功能开发时，**精准改动 + 过度设计自检**主导。判定不清 → 默认走根因优先。

### 动手前自查（防多 session 重复发明）

> 2026-05-01 教训：我在本 session 写 `tools/git-hooks/pre-commit` 时，另一并行 session 刚好也在写同一个 hook，1 分钟差距，**字节级一致**。若我动手前 `git log` 一下，至少省 5 分钟编辑 + 一次 commit。

**触发条件**（任一为真，必须先跑 git log）：
- 准备新增系统级文件（hooks / scripts / agents / commands / rules）
- 准备做"这个应该存在但好像还没有"的假设
- 准备建议某个 missing 防御机制 / CI / hook
- 长 session（>30 分钟）后第一次切换到新任务（state 可能过期）

**最小检查**（5 秒）：
```bash
git log --since="30 minutes ago" --all --oneline    # 别的 session 提交了啥
git status                                          # 当前未提交状态
```

**如果发现重叠**：读它的 commit/diff，决定是 ① 接受现成方案 ② 我的方案有补充价值 → 沟通后再写。**禁止**："不知道有"就直接开写。

适用于所有任务模式，不仅 fix。

### 1. 根因优先，不走捷径（最高优先；适用于所有 fix / bug / 事故 / 异常 / 测试失败）

修复 bug 和改进架构时，**禁止**追求"最小改动"或"最快修复"：

| 反模式（病态乐观）| 根因做法 |
|----|----|
| "最小修复是 X" | "根因是 Y，彻底解决方案是 Z" |
| 看到症状就打补丁 | 加日志/复现/读数据流先证伪假设 |
| 在上层绕过架构问题 | 直接改架构，不留 workaround |
| 为不破坏现有调用而保留错误行为 | 同步改所有调用点，一次到位 |
| "应该没问题" / "理论上 OK" | 跑测试 + 看输出 + 用证据说话 |
| "等用户问起再修周边" | 同根因引发的同类问题一并修 |

强制三步法（来自 quant-deploy/CLAUDE.md §十一）：
- **Step 1 根因分析**（禁止跳过）：用诊断日志 + state 追踪定位组件；画完整数据流；判定**设计问题**还是**实现 bug**
- **Step 2 方案评审**（禁止跳过）：自问 4 件事 — ① 这是消除根因还是绕过症状？② 修复是否引入新的阻塞/竞态？③ 对延迟预算/live trading 影响？④ 有更简单方案吗？
- **Step 3 验证**（禁止跳过）：≥3 分钟持续性测试，不只是瞬时检查

**修完要能回答**：同类问题不会再发生。如果还能发生 → 没修完。

**禁止的"症状级措辞"**（一旦说出，立刻自我警觉是不是在走捷径）：
- "10 分钟小改" / "顺手就修了" / "minimal fix" / "quick patch"
- "先这样，后面再优化" / "暂时绕过"
- "应该没问题" / "理论上 OK"

如果你必须做症状修复（罕见，例如 hotfix 救火），**必须**：
- 显式说"这是症状修复，根因 = X，根因修复 issue 在 Y"
- 同时 commit 一个 TODO 文件或 issue 跟踪根因修复
- 不允许"症状修了就 close"

### 2. 精准改动（Surgical Changes；适用于**非 fix** 任务）

> 此规则只在做新功能、改进、refactor 等**非修 bug**任务时主导。处理 bug/异常时被规则 1 覆盖。

每一行改动必须直接追溯到用户请求：
- **不顺手重构**周边代码、注释、格式
- **不加**未要求的功能、参数、错误处理
- **不删**与本次任务无关的死代码（发现了可以提出，但不动手，等用户确认）
- 匹配现有代码风格，即使你会用不同写法
- 你的改动产生的孤立 import/变量/函数 → 清理；已有的死代码 → 不碰

**自检**：diff 中每一行能否直接指向用户请求？不能 → 删掉那行。

**注意**：当任务是 fix bug 时，规则 1 的"宁可多改几个文件"压过本规则。修同类型 bug 时同步修兄弟文件**不算**精准改动违规。

### 3. 过度设计自检（仅适用于新功能开发）

写完代码后问自己：**"一个高级工程师会说这太复杂了吗？"**
- 如果 200 行能用 50 行解决 → 重写
- 单次使用不要写抽象类/策略模式/工厂
- 不加没要求的灵活性、可配置性、泛型参数
- 不为不可能的场景写防御代码

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

## Skill 组织标准

> 2026-05-01 全量优化所遵循的规则，新增/编辑 user-level skill 必须遵守。

1. **Frontmatter 仅 name + description** — 删除 origin/version/triggers/tools/mode/max_rounds 等非标准字段
2. **name = 目录名** — 包括 ecc-* 前缀（与 plugin 同名 skill 显式区分）
3. **Description = "Use when..." 触发条件** — 不总结 workflow，不写第二人称命令式
4. **重叠 skill 显式互引** — description 末尾加 "For X use other-skill"
5. **>500 词的 SKILL.md 必须拆分** — overview ≤ 500 词 + 子文档（每个 ≤ 800 词）
6. **拆分时逐字保留代码块/JSON/表格** — 不能只剩骨架（codex 双审捕到的反模式）
7. **索引** — 全部 40 个 skill 列在 `~/.claude/skills/INDEX.md`，按场景分类

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
- [2026-05-01] Claude 长期默认"快速能用"而非"长期正确"，元反思识别 5 类系统级偏差：① task-router 默认 fast；② evaluation-gate 阻断时 `set-mode --reset` 是零摩擦逃生通道；③ "精准改动"压过"根因优先"；④ 没有 hook 检测症状-vs-根因；⑤ Discord 对话格式正向激励碎片化 → 一次性改 5 处反向力：① CLAUDE.md §编码行为准则 重排（根因优先放第一条）② `set-mode --reset` 加 reason+1h cooldown+可疑词阻断 ③ 新增 `user-prompt-classify.js` hook（fix 关键词自动 fast→standard，session 首条 prompt 注入深度评估）④ 新增 `fix-depth-check.js` hook（fix 提交无根因解释 → 软警告）⑤ 文档化反模式短语清单（"10 分钟小改"等）。所有改动详见 §风险控制 §Long-term correctness 守卫机制
- [2026-05-01] 实战首次校准：cooldown 1h 实测在单 session 多任务边界场景下太紧（3+ 边界/h 是常态）→ 缩到 20min；bypass 词表移除 "commit"（太通用，误伤合法 doc/refactor commit reason）。**教训：守卫摩擦设计要先做小回环测试再固化参数，不能凭直觉**
- [2026-05-01] 多 session 并行写同一个 pre-commit hook（1 分钟差距，字节级一致）→ 重复发明 → 加 §编码行为准则·动手前自查 纪律：系统级新增 / "应该存在但没有"假设 / 长 session 任务切换前必须跑 `git log --since="30 minutes ago" --all`
- [2026-05-02] `~/.memory/long-term.md` 累积 101 条重复 entry → 根因 `stop-summary.js:promoteWeeklyToLongTerm()` 缺 intra-list dedup（同一 lesson 跨多个 weekly sub-section 出现时 push 多份），且 existingKeys/filteredLessons/filteredDecisions 三处 normalize 不一致 → 修复：dedupBatch helper 统一走 `lessonKey()`；同步修 `memory-consolidate.js` 的同类架构空洞；写 `/tmp/dedup-long-term.js` 一次性清理 221→120 行。**教训**：每个写入 long-term 类聚合文件的路径必须在 write 前用 SSOT key 函数（`lessonKey()`）做 (existing ∪ batch) 双重去重，三处 normalize 函数不能复制粘贴各自实现
- [2026-05-03] `evaluation-gate` × `pre-tool-escalate` 死循环阻塞 cross-repo push → 根因:`evaluation-gate.js` 设计假设"所有 git push 都属于 projectRoot 业务流",但**没看命令实际 cwd**;`cd /tmp/other-repo && git push` 时,push 目标是另一个 repo,但 hook 仍按 quant-deploy 的 marker / HEAD 检查,语义错位。同时 `pre-tool-escalate` 把所有 `git push` 字面量识别为 risk-signal 自动升档 heavy → 进入死循环(reset→fast 后下次 push 又升 heavy 又拦)。修复:`evaluation-gate.js` 加 `extractCdTarget(cmd)` 辅助,main 中检测命令以 `cd /path && ...` 起始且 `/path` 不在 projectRoot 内 → exit 0 豁免。单元测试 7/7 + 实战 push 验证通过。**教训**:① 任何 PreToolUse 守卫看命令文本时,要考虑 `cd /elsewhere && cmd` 这种命令切换 cwd 的场景,默认 hook payload.cwd 不一定等于命令实际 cwd ② 守卫互锁(escalate + gate)要在设计阶段画状态机,确保 reset 路径不被自动升档反向闭合,否则用户陷入"reset → 升档 → 拦截 → reset"循环 ③ marker schema 防 forge 同时也要给 cross-context 操作留豁免出口,不然合法操作也得绕
- [2026-05-03] `.memory/` 嵌套+污染累积事故 → 根因双层：① `lib/utils.js:getProjectRoot()` 用 `git rev-parse --show-toplevel` 找 project root，但 `.memory/` 自身就是独立 git repo（设计如此，跨设备同步用），结果在 `.memory/` 内启动 hook 时 `getProjectRoot()` 返回 `.memory/` 自身 → hook 把 `.memory/` 当 project root → 在内部又创建 `.memory/.memory/`（观测到 3 层嵌套 + 8 个子项目副本：celue-main/.memory、quant_base-main/.memory、web/.memory、web/src/.memory 等）；② `.memory/` repo 没有 `.gitignore`，所以 `git add -A` 把 `.claude/.task-mode`、`.escalation-state.json`、`.promote-lock` 等运行时状态文件全 commit 进 memory repo → 209+915 commit 几乎全是 .task-mode flapping 噪音；③ memory-sync.js 的 `isEnabled()` 看 `.claude/.memory-remote` 文件，但用户从未创建过 → push 永远 silent no-op → 209+915 commit 全卡本地，跨设备同步从未真的工作。修复:① `lib/project-root.js` 加 `isInsideMemoryRepo` + `escapeMemoryRepo`，`getProjectRoot()` 落 `.memory/` 时 walk-up 到第一个非 `.memory` 祖先（test 10/10 pass）② Strategy Z 重建两个 repo,加 `.gitignore` 排除 .claude/.json/.lock，仅追踪 *.md ③ 创建 `~/.claude/.memory-remote` 让 isEnabled=true。**教训**：① 任何"独立 git repo 嵌入主 repo"的设计必须配 `.gitignore` 守卫,否则父级 hook 会把运行时状态污染进它 ② "git toplevel = project root"的假设在嵌套 git repo 场景下错误,project root 判定要避开已知子 repo 类型 ③ "isEnabled-based no-op"的同步设计要在 hook log 输出"sync disabled, set X to enable",否则用户以为在跑实际没跑
