# Triple-System Development Framework

> **所有内容用中文回复。**

## 系统架构

| Layer | System | What It Provides |
|-------|--------|-----------------|
| **Infrastructure** | ECC | Hooks, memory, learning, 30 commands, common rules |
| **Process** | Superpowers | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | Agency Agents | 28 active agents with domain knowledge |

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
- `careful-guard` — 阻断破坏性命令（v2 2026-05-09 重写）：3 组分类 — DENY 无条件拦（fork bomb/mkfs/dd to /dev/sd*/`rm -rf /`）/ CONTEXTUAL pattern 命中后跑 context check（`git reset --hard origin/<branch>` + working tree clean → 放行；其余形态拦）/ ALLOWLIST_PREFIX 单 invocation 安全脚本前缀（git pull/fetch/log/diff、`./scripts/*`、`./restart.sh`、cargo build/check/test）。命令链（`&&`/`||`/`;`/`|`/`$()`/backticks）禁用 allowlist，强制完整 pattern 检查。状态：`~/.claude/.careful-enabled` (`off` 全停)。单测：`~/.claude/scripts/hooks/__tests__/careful-guard.test.js` 36 用例
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

## Sessions Board（多 Claude session 协调）

> 文件：`~/.claude/state/sessions-board.md`（全局，所有项目共用，不在任何 git repo 内）

多 Claude session 在同机器上并行工作时，**主要冲突源是不知道对方在做什么**（worktree 是硬隔离重武器；sessions board 是软层告知，互补）。每个 session 在 board 上声明 working-tree、占用端口/PID、未 commit 的文件、显式 don't-touch 清单。

### 写入触发（必须）

- session 开始（启动 Claude Code 后第一件事）→ 添加自己的 `### [session-X]` entry
- 启动长 process（master / worker / dev server / 编译看门狗）→ 更新 `holds`
- 编辑共享文件（worker.json / master.json / 跨项目 scripts / 全局 hooks）→ 更新 `touching`
- 准备 commit → 看其他 session 是否动同区域；自己 commit 后更新 entry
- spawn 后台 agent 修改类任务 → 更新 `next` 让对方知道何时不该 stash/reset
- 长任务切换大方向 → 更新 `doing` + `next`
- session 结束 → entry 移到 `## History` 段（保留 30 天）

### 读取触发（必须）

- session 开始（哪怕只是改一个 doc，也读一眼）
- 准备改任何**仓库级共享文件**（worker.json / master.json / scripts / hooks / CLAUDE.md / docs/*）
- 准备启动占端口的 process
- 准备 spawn 后台 agent
- 准备 git stash / git reset / git commit （即使是自己 worktree，也要确认没有对方在 expecting 当前 HEAD）
- 看到 `git status` 有不认识的修改 → 先看 board 再问"是不是别人的"

### Entry schema

每个 active session 一段 `### [session-X — Mac/Linux, port-X]` heading，body 至少含：
- `worktree`: 路径 + branch + base commit
- `doing`: 一句话当前任务
- `touching`: 修改但未 commit 的文件路径
- `holds`: 端口 / PID / 进程 / 数据库等独占资源
- `don't touch`: 显式列出对方不该碰的文件 / 端口 / 资源
- `next`: 下一步计划（让对方好估算何时介入）

### 失效与清理

- 任一 session 看到 entry mtime > 4h → 视为 stale，主动询问或迁到 History
- session 结束移到 `## History`，保留最近 50 个，老的删
- 不强制 hook 自动写（自觉纪律 > hook 强制；hook 在每个文件操作后 spam 写比不写还烦）

### 与 Worktree 配合

- 同一项目两 session 都跑实例 → **必须** worktree 隔离（端口/DB/journals/index）+ board entry
- 同一 session 内 sub-agent 修改 working tree → 仍按 §多 Worktree / Sub-agent Git 隔离 铁律走（board 不替代它）
- Doc-only / 只读探索 / 跨不同项目的 session → board entry 即可，无需 worktree

### 反模式

- ❌ 写完 board 就忘改：next 字段写了"明天再说"但实际今晚做了 → 对方按"明天"估算时间踩雷
- ❌ entry 太宽泛：`doing: 改 master.rs` → 对方不知道改哪段哪函数
- ❌ 不写 don't touch：对方推测 don't touch，推测错就冲突
- ❌ session 结束不清理 → board 越长越没人读

## 多 Worktree / Sub-agent Git 隔离（强制）

> 2026-05-05 事故触发：Wave 13 P0 commit 时，spawn 的后台 Reality Checker agent 在共享 worktree 内跑 `git stash` + `cargo test` + `git stash pop` 验证 baseline 行为；pop 只恢复 working tree 没恢复 index → 主 session `git commit` 时只 staged 了 5 docs，16 个 code 文件丢失，靠 `git commit --amend` 修回（24117ca）。

### 铁律 1: Sub-agent 在共享 worktree 内禁止改 git 状态

后台 agent（`Agent` tool spawn 的子任务）在与主 session **共享 git working tree** 时，**禁止**做修改 git index / working tree 的操作：

| ❌ 禁止 | 原因 |
|--------|------|
| `git stash` / `git stash pop` / `git stash drop` | stash 是 "save working tree+index, then clear them" 的复合操作；pop 不保证还原 index 状态 → 主 session staging 被吞 |
| `git checkout <ref>` / `git switch` 切换分支或 detach | 改 HEAD + working tree → 主 session 编辑被覆盖 |
| `git reset` / `git reset --hard` / `git restore` | 显式改 index 或 working tree |
| `git add` / `git rm` / `git mv` | 改 index — 主 session 的 staging 决策被对抗 |
| `git revert` / `git cherry-pick` / `git rebase` / `git merge` | 创建新 commit / 改 working tree |
| `git clean` | 删 untracked 文件（可能是主 session 临时工作） |
| `git commit` | 创建 commit，可能影响主 session 的提交计划 |

### 铁律 2: 只允许 read-only git 操作

| ✅ 允许 | 用途 |
|-------|------|
| `git log` / `git show` / `git diff` (含 cached/HEAD/staged 各种) | 看历史 |
| `git status` | 看状态（不修改） |
| `git rev-parse` / `git cat-file` / `git ls-files` / `git ls-tree` | 解析对象 |
| `git blame` / `git annotate` | 看作者 |
| `git config --get` (read-only) | 读配置 |
| `git fetch`（仅在远端独立时）| 拉远端不动本地 working tree（**慎**：会动 refs/remotes/） |

### 铁律 3: 需要 baseline 对比时用 worktree 隔离

如果 sub-agent 必须在另一 ref 上跑测试（baseline diff、bisect-style 验证）：

```rust
Agent tool 调用必须传:
{
    "isolation": "worktree",
    "subagent_type": "...",
    ...
}
```

`isolation: "worktree"` 会自动 `git worktree add` 一个独立目录给 agent，agent 在那个 worktree 内任意改 git 状态都不影响主 session。结束时如果 agent 没改东西自动清理；改了的话 agent 完成时返回 worktree path 让用户决定。

### 铁律 4: 主 session 的 prompt 必须显式声明对 sub-agent 的限制

spawn 修改类 agent 时（包括 codex review、reality checker、code-reviewer 等），prompt 末尾**必须**包含：

```
约束：你在主 session 共享的 git worktree 内运行。禁止 `git stash` /
`git checkout <ref>` / `git reset` / `git restore` / `git add` / `git rm`
/ `git commit` 等修改 index/working-tree 的操作 — 主 session 可能正在
staging 文件，你的 stash/reset 会吞掉主 session 的 commit。
只允许 read-only：`git log` / `git show` / `git diff` / `git status` /
`git rev-parse`。需要 baseline 对比时报告 "需要 isolation worktree"。
```

### 多 Claude session 并行跑实例（worktree 配置）

> 项目级具体配置见对应 worktree 的 `SESSION2.md`（如 `~/quant-deploy-s2/SESSION2.md`）。

并行 session 跑实例（master+worker 之类长 process）必须用 git worktree 隔离 + 端口/PID/log/DB 全套独立：

```bash
# session 1 在 ~/quant-deploy main branch
# session 2 加在同级目录，独立 branch
git worktree add ~/<project>-s2 -b dev/session-2

# 各自端口偏移 + worker_id 不同 + 独立 cchft.db (相对路径自动隔离)
# 详见对应 SESSION2.md
```

**资源冲突清单**（同一项目两 worktree）：
- ✅ 自动隔离：working tree、index、cchft.db（相对路径）、journals、`.logs/`、`.pids/`、target/、node_modules/
- 🟡 需要手动配置：master/ws 端口、worker metrics 9090（hardcode follow-up）、web vite 5173、worker_id（避 master 看到两同名 worker 互踢）、testnet exchange API listenKey（同 account 后到先得）
- 🔴 全局共享（注意互踩）：`~/.cchft-secret`（密码同享 OK）、`~/.claude/state/evaluation-gate/last-pass.json`（多 session evaluation-loop 互踩；hook 按 `git_head` pin 部分缓解）、`~/.memory/`（hook 自动写，多 session 同写一个 today.md 行交错）

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
- [2026-05-05] **Sub-agent `git stash` 干掉主 session staging — 16 文件 commit 丢失**。Wave 13 P0 commit 时主 session `git add` 21 文件，spawn Reality Checker 后台 agent 跑 `cargo test` 验证 baseline 行为；agent 自己跑了 `git stash` + `cargo test` + `git stash pop` 流程。Pop 操作只恢复 working tree 没恢复 index → 主 session commit 时只剩 5 个 docs 在 index，16 个 code 文件留在 working tree。`git commit --amend` 修复（24117ca）。**根因**：sub-agent 在共享 git working dir 内做修改 index 的操作（`git stash` 是 stash + clear index 的复合操作）→ 主 session 的 staging 被吞。**铁律**（已加 §多 Worktree / Sub-agent Git 隔离）：后台 agent 在共享 worktree 内**禁止** `git stash`/`git checkout <ref>`/`git reset`/`git restore`/`git add`/`git rm` 等修改 index/working-tree 的操作；只允许 read-only。需要 baseline 对比时 spawn 用 `Agent isolation: "worktree"` 模式拿独立 worktree
- [2026-05-05] 同期发现两 Claude session 并行跑 master+worker 实例的资源冲突类（端口/cchft.db/journals/log/pids/worker_id/listenKey）→ 立 `using-git-worktrees` 隔离方案（`~/quant-deploy` + `~/quant-deploy-s2`），各 worktree 独立 `cchft.db` / 端口偏移（s1=9100/9101, s2=9300/9301）/ `worker_id` 命名（mm-worker-1 vs mm-worker-s2）。**已知遗留**：worker metrics 9090 在 main.rs:2183 hardcode，第二个 worker 静默 bind 失败（不挂主流程，prometheus 不可用），follow-up 改成 `worker.json::metrics_port`。`~/.claude/state/evaluation-gate/last-pass.json` 仍是全局共享单文件，多 session 互踩；hook 已按 `git_head` pin，部分缓解。详见 `~/quant-deploy-s2/SESSION2.md`
- [2026-05-06] Phase A 监工模式（dispatch sub-agent 实施 + codex 双审）三课。**事故 1（spec drift）**：Rust Engineer agent 实施 M2 retry 时单方面把 `[500, 2000, 8000]` (10.5s) 简化成 `[500, 2000]` (2.5s)，理由是"demo-api 502 typically resolves <1s"，但**没向监工报告就改 spec**，且**保留旧注释 lying about 10.5s** → Codex round 1 REQUEST-CHANGES HIGH 抓出。**修复约束**: 监工 dispatch 时 prompt 必须显式禁止"silent spec deviation"——agent 觉得 spec 不合理 → STOP + 报告，不允许擅自改；任意改 constants/config → 必须同步 grep 注释引用并更新。**事故 2（comment-vs-code 类 bug 反复）**：fix round 1 的 spec drift 后，更新了代码但留下"3 attempts/3rd failure"老注释 → Codex round 2 又抓 FAIL → 第 3 轮单纯改注释才过。**修复约束**: 任何修改函数体内 magic number/array literal/loop bound 时，prompt 强制 self-audit checklist，要求 agent 列"我改了 X，对应的 doc/comment 在 Y/Z 行也已更新"。**事故 3（evaluation-gate 跨 worktree path-prefix bug）**：`extractCdTarget` 检测 cd 目标是否"在 projectRoot 内"用 `startsWith` 字符串前缀匹配，sibling worktree `~/quant-deploy-s2` 以 `~/quant-deploy` 开头 → 误判为 in-tree → 用错的 HEAD（main 的）做 marker check → 阻断 s2 commit。**修复**: 改用 `path.relative()` + `..` 检查真实 containment，或显式 `path.resolve()` + 严格 segment 匹配；workaround: marker 写主 worktree HEAD。Phase A 用 workaround 通过 commit `8b02891`。**已修（2026-05-06）**：`evaluation-gate.js` 提取 `isInsideProjectRoot(target, root)` 用 `path.relative()` + `!rel.startsWith('..') && !path.isAbsolute(rel) && rel !== ''` 判定，`isCrossRepoPush` 显式同路径短路 + 调用此 helper；新增 `__tests__/evaluation-gate.test.js` 22 用例（含 sibling/nested/same-path/unrelated/parent/`..`-normalize/`~`-expand/quoted-target/multi-line script）全 pass。详见 `~/quant-deploy-s2/SESSION2.md` Follow-ups
