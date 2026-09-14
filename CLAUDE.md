# Triple-System Development Framework

> **所有内容用中文回复。**

## 系统架构

| Layer | System | What It Provides |
|-------|--------|-----------------|
| **Infrastructure** | ECC | Hooks, memory, commands, common rules |
| **Process** | Shared Workflow Kernel | Fast / Standard / Heavy、范围确认、计划、单次审查、验证、交接 |
| **Expertise** | Agency Agents | 按需使用的领域知识，不默认派发 |

## 工作流程

```
User Request
    │
    ├─► ECC Infrastructure (自动触发)
    │   SessionStart → 加载上次会话状态
    │   PreToolUse → 危险命令守卫、编辑冻结
    │   PostToolUse → 自动格式化、类型检查、漂移检测
    │   PreCompact → 上下文压缩前保存状态
    │   Stop → 保存状态、教训/commit 沉淀(stop-summary)、成本追踪、任务板维护
    │
    ├─► Shared Workflow Kernel (与 Codex 同语义)
    │   Requirement Confirmation（按条件）
    │   → Plan → Execute → Review → Verify → Docs Sync → Summary
    │   Fast 且清晰：Execute → Verify → Summary
    │   Review 默认一次；只有修复 Critical/High 后允许一次复核
    │
    └─► Agency Agents Expertise (专业视角)
        仅在独立、高价值且边界清楚时按需使用
```

### 已停用的旧流程层

Superpowers 插件及其活动入口已停用。`using-superpowers`、`subagent-driven-development`、
逐任务/逐分块 reviewer、强制 TDD、强制 worktree、Heavy 自动 evaluation-loop 和
`evaluation-gate` commit marker 均不再属于执行流程。文件下方若出现相关事故记录或历史名称，
只作为历史资料，不构成当前指令。当前唯一交付语义以上述 Shared Workflow Kernel 为准。2026-09-13 清除了 evaluation-gate 的残留描述（infrastructure.md Marker Schema 段、Systems RC agent 的 marker 指令）；set-mode 冷却保留但不再以该门为由。

## 优先级

1. **用户显式指令** — 最高优先
2. **ECC hooks & rules** — 基础设施（100% 可靠）
3. **Shared workflow skills** — 按任务风险启用的流程能力（HOW）
4. **Agency Agents personas** — 专业知识/角色（WHO）

## 任务模式路由

> 详细规则见 `~/.claude/rules/routing.md`（自动加载）。

**推荐命令链**：
- Fast：直接做 → `/verify`
- Standard：必要时 `/plan` → 实施 → 按风险一次 `/code-review` → `/verify`
- Heavy：确认 Execution Brief → `/plan` → 实施 → 一次 `/code-review` → `/verify`

`evaluation-loop` 只用于有基线、指标、验证命令和守护命令的可度量改进，默认最多 3 轮；
它不是 Standard/Heavy 的默认步骤。代码审查默认一次，只有修复 Critical/High 后允许一次复核，
第三次及以后必须由用户明确要求。

## Agent 路由（专长 agent，capital 名，按需）

> Spawn 用 frontmatter 的 canonical name（Capital Phrase 风格）。基础设施 agent（lowercase: `code-reviewer`、`security-reviewer` 等）见 `~/.claude/rules/common/agents.md`。

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `Frontend Developer` | Security audit | `Security Engineer` |
| API/Database | `Backend Architect` | Code review | 主 agent 单次 Review Gate |
| Architecture | `Software Architect` | Prototype | `Rapid Prototyper` |
| Technical docs | `Technical Writer` | Rust | `Rust Engineer` |
| Reality check | `Reality Checker` / `Systems Reality Checker` | | |

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

查询：`node ~/.claude/scripts/hooks/get-model.js <agent-name>`

## 风险控制

全权限 + hook 守卫模式（配置在用户级 `~/.claude/settings.json`）。完整 hook 行为表 + 升档/降级机制详见 `~/.claude/rules/common/infrastructure.md`。

### Long-term correctness 守卫（2026-05-01 反向力机制）

> 背景：用户元反思发现 Claude 长期默认"快速能用"而非"长期正确"。本机制是反向力。

| 机制 | 守什么 |
|------|--------|
| §编码行为准则 重排 | Rule 1 根因优先 > Rule 2 精准改动 > Rule 3 过度设计 |
| `user-prompt-classify` hook | fix/bug 关键词自动升 standard + 首条 prompt 注入深度评估 |
| `fix-depth-check` hook | fix-only commit 缺根因 → stderr 软警告 |
| `set-mode --reset` 加固 | `--reason` ≥10 字符 + 20min cooldown + 可疑词阻断（防无理由降档） |
| Verification Gate | 完成声明必须附最新、相关的验证证据；不能运行的部分明确披露 |

**反模式自警**（说出/做出立刻警觉）：
- 说"症状级措辞"（详见 `on-demand/coding-discipline.md`）
- 为通过流程门而伪造标记或无理由降档
- bug 报告先想"如何最小修复"而非"为什么这个 bug 可能"
- 修了 schema 漂移类问题但不查"为什么没被任何检查抓到"
- 任务切碎成"做一段→报告→等批准"小循环（Discord 格式陷阱）

## Quick Commands

| Command | Purpose | 适用模式 |
|---------|---------|---------|
| `/plan` | 规划实现（强制输出 AC） | Standard+ |
| `/verify` | 验证检查 | 所有模式 |
| `/code-review` | 代码审查 | Standard+ |
| `/save-session` / `/resume-session` | 保存/恢复会话 | Standard+ |
| `/careful` | 危险命令守卫开关 | 所有模式 |
| `/freeze` / `/unfreeze` | 编辑范围锁 | 所有模式 |
| `/mode-explain` | 显示当前 mode + 历史变更（谁改的/何时/为什么），读 `.claude/logs/mode-trace.jsonl` | 所有模式 |
| `/codex:rescue` | 委派复杂任务/根因/二次实现给 Codex（详见 §Codex 调用规则） | 所有模式 |
| `/codex:review` `/codex:adversarial-review` | Codex 视角代码/对抗审查 | Standard+ |
| `/codex:setup` `/codex:status` `/codex:result` `/codex:cancel` | Codex 运行时管理 | 所有模式 |
| `/design-consultation` | UI 实施前多视角设计咨询（UI Designer + UX Architect + Researcher 并行） | Standard+ |

全部命令见 `~/.claude/commands/` 和 `~/.claude/skills/`（skill 索引：`~/.claude/skills/INDEX.md`）。

## 记忆系统（双层）

双层：`~/.memory/`（全局跨项目）+ `PROJECT/.memory/`（项目独立）。**`.memory/` 不进 SessionStart system context**（不增加加载 token），只在 Claude 主动搜索或 `promoteLessons()` 回写时被引用。

**三个自动采集触发点**（共享 `extract-lessons.js`）：① Periodic hook 每 30 分钟、② PreCompact hook 压缩前、③ Stop hook 会话结束兜底。门控：无 commits + 无 lessons + 无 decisions → 不记录。

**`promoteLessons()` 关键行为**：扫 `.memory/today.md` / `weekly.md` / `long-term.md`，出现 2+ 次的教训自动写入 **`.memory/promoted-lessons.md`**（按需引入，随 memory repo 跨机同步）。〔2026-08-02 T-old-coder B9 从源头改 promote 落点：原写回 CLAUDE.md 是其"持续增肥泵"（项目 CLAUDE.md 曾 197KB 超 155KB 上限），迁出后 CLAUDE.md 停止自动膨胀；遗留已 promote 条目留在 CLAUDE.md，去重仍对照防重复〕。

**Claude 写教训格式**（hook 自动提取依赖此格式，必须保持）：
```markdown
**Lessons:**
- 问题描述 → 正确做法
```

完整目录布局 / 三级流转规则 / 去重机制详见 `~/.claude/rules/common/workflow.md` §记忆系统。

## 编码行为准则

**Rule 0 之下的三规则按优先级**：① 根因优先（fix/bug/事故时主导，压过其余）② 精准改动（非 fix 任务主导）③ 过度设计自检（新功能）。判定不清 → 默认走根因优先。

### 0. 只替换，不并存（Rule 0，凌驾于下面三条；2026-09-13）

任何新增的持久对象——代码路径、闸、字段、旋钮、测试、文档条目、注释段、脚本、hook、报告、记忆条目、worktree——加入前必答"**它替代了什么**"。合格答案只有两种：① 替代了 X，且同一改动内删除 X；② 它是事实 F 的唯一的家，且 grep 证明 F 现在没有家。答不出 → 不加。修一个错值时答案是"替代了错值"，所以什么都不附加。

它合并并取代了四个旧碎片，现在只是例子：**数据源**（原 SSOT 单一访问器铁律：读共享值先 grep canonical 访问器，引入新源必须同一改动内让旧 API 委托到新源，绝不留两个活源；全局 hook `ssot-source-guard.js` 软提醒）、**代码对象**（CCHFT 不变量 #26）、**文档落点**（同一事实只保留一个人工维护来源）、**抽象**（单次使用不写抽象 / 策略 / 工厂，不为不可能场景写防御）。

修类别 bug 时扫兄弟适配器不算 scope creep：修复必须落到该规则唯一的家，或证明只有该实例有此 bug。项目级执行点：CCHFT `tools/git-hooks/commit-msg` Gate 0（新增持久对象的 commit 必带 `replaces:` / `home:`）；探测器 `scripts/audit/bloat-metrics.sh` 月度运行。spec：`quant-deploy/reports/bloat-cleanup-spec-2026-09-13.md`。

### 动手前自查（防多 session 重复发明）

任一为真必须先跑 `git log --since="30 minutes ago" --all --oneline`：① 新增系统级文件（hooks/scripts/agents/commands/rules）② "应该存在但还没有"假设 ③ 建议 missing 防御机制 ④ 长 session 切新任务。重叠则读对方 commit 决定接受/补充/沟通。

### 1. 根因优先（fix/bug/异常/测试失败）

**强制三步法**（禁止跳过）：① 根因分析（设计问题 vs 实现 bug）② 方案评审（消除根因还是绕过症状？引入新阻塞？延迟影响？更简单方案？）③ 验证（≥3 分钟持续性测试）。
**修完要能回答**：同类问题不会再发生。
**禁止症状级措辞**（说出立刻自检）："10 分钟小改" / "minimal fix" / "顺手修了" / "先这样" / "应该没问题" / "理论上 OK"。
**症状修复需 hotfix 救火例外**：显式标"这是症状修复，根因 = X，根因修复 issue 在 Y"，同时 commit TODO 跟踪。

### 2. 精准改动（非 fix）

每行 diff 直接追溯用户请求：不重构周边、不加未要求功能、不删无关死代码（提议但不动）、匹配现有风格。**fix bug 时本规则被规则 1 覆盖**。

### 3. 过度设计自检（新功能）

并入 Rule 0：单次使用的抽象、可配置性、防御代码都不是任何事实的唯一的家。写完问自己"高级工程师会嫌复杂吗"。

### 4. 任务实施前 4 问反思（强制，针对 spec/M-X/Wave/Phase 引用类任务）

> 2026-05-21 教训：M-27/M-30 KNOWN_ISSUES 列 "deferred Wave 14 ~150 LOC 类型化重构"，用户问了 4 个问题后，Claude 立即给出 30 LOC 持久化边界胶水方案，ROI ~25-100×。这 4 问应在**任何实施前自动跑**，不应依赖用户提醒。

**触发条件**（任一为真）：
- 用户引用 KNOWN_ISSUES `M-NN` / `LEGACY-M-NN` / `Wave-X` / `Phase-X` / `T-N` 等 spec 编号
- 用户说"实施 / 开始做 / 按计划 / 按 backlog / implement / execute / proceed"
- 任务来自 OPTIMIZATION_BACKLOG / ADR / pre-existing spec 文档

**4 问反思**（动手前必报告答案，未答之前禁止估算工作量）：

1. **是否偶发还是反复触发？** — 读 KNOWN_ISSUES 原 entry：是 "single trade / 已复现一次 / once" 还是 "反复触发 / 持续暴露"？一次性事故可能不需 ~150 LOC 重构。

2. **是否已部分修过根因？** — `git log --all --oneline -S "<关键 symbol/M-X 引用>"` 找历史 commit。Wave-N 类 spec 常常在 round-K 已补丁落地，spec 文字是旧快照。检查 "已修 / ✅ / ⏩" 状态。

3. **原 spec LOC/day 估算是否还准确？** — 上游模块可能已删/重构/类型已改。`grep` 目标符号验证现存性。M-65 类 spec 写 "~1200 LOC" 但目标模块可能已被 archive。

4. **下游 SSOT 胶水/单点 check 能否覆盖同样意图？** — 持久化边界(`db.rs`) / 通道边界(channel boundary) / 不变量 enforce 点 常常用 30 LOC 单点 reject 替代 150 LOC 上游类型化重构。M-27/M-30 案例即此。

**报告格式**（实施前给用户）：
```
1. 偶发/反复: <答案 + 证据>
2. 已修过吗: <commit hash 或 "无">
3. spec 准确性: <"准确" / "过期 — 现状 X 与 spec Y 不符">
4. 胶水覆盖: <"可" + 替代方案 + ROI / "不可" + 原因>
→ 推荐方案: <full spec / 胶水 / 不做>
→ 询问用户确认是否按推荐执行
```

**违反检测**：用户问"是否偶发?是否已修?胶水覆盖?"这类 meta-question 时，Claude 没有事前反思就是失败。自动化:`user-prompt-classify.js` IMPLEMENTATION_INTENT_PATTERNS 命中时 inject `[Scope-Reflection Required]` 段强制 4 问。

**不适用场景**：用户明确说"按 spec full 实施 / 不要反思 / I want the full refactor" → 跳过反思直接做。

### 模糊需求

多种合理解读时**列选项给用户选**，不默默选一种。

### /plan 验证格式

每步必须附 `→ verify: [命令/条件]`，模糊标准（"让它工作"）需反复澄清。

完整反模式对比表 / 强制三步法 4 自问 / 精准改动 5 例 / 过度设计完整对比 / 模糊需求模板 / /plan 验证 ASCII 详见 `~/.claude/on-demand/coding-discipline.md`（按需引入）。

## Skill 组织标准

> 2026-05-01 全量优化所遵循的规则，新增/编辑 user-level skill 必须遵守。

1. **Frontmatter 仅 name + description** — 删除 origin/version/triggers/tools/mode/max_rounds 等非标准字段
2. **name = 目录名** — 包括 ecc-* 前缀（与 plugin 同名 skill 显式区分）
3. **Description = "Use when..." 触发条件** — 不总结 workflow，不写第二人称命令式
4. **重叠 skill 显式互引** — description 末尾加 "For X use other-skill"
5. **>500 词的 SKILL.md 必须拆分** — overview ≤ 500 词 + 子文档（每个 ≤ 800 词）
6. **拆分时逐字保留代码块/JSON/表格** — 不能只剩骨架（codex 双审捕到的反模式）
7. **索引** — 所有 user-level skill 必须列在 `~/.claude/skills/INDEX.md`，按场景分类（数字以 INDEX.md 为准，不在本文 hardcode）

## 一致性原则

1. **先质疑假设，再动手** — 从事实出发
2. **不重复** — Rule 0 只替换不并存
3. **不破坏** — 引入新依赖或破坏现有接口前，必须获得用户确认
4. **Outcome 优先** — 先确认用户要的结果（不是功能），再分析怎么做。诊断问题时用证据不用猜测 — 加日志、跑测试、看数据，禁止连续给出未经验证的不同猜测

## Triple-System 自演进铁律（强制）

> 改 `~/.claude/` 下的 hook / skill / agent / command / rule / settings / 本文件 = 系统级改动。全文（作用域判定表、反模式、通用文档化触发）见 `~/.claude/on-demand/self-evolution.md`。

- 系统级改动三项硬要求缺一不可：① 实现本身 ② 规则文档（本文件或 `rules/*.md`）③ 可发现性（对应 INDEX.md 或 description）。验证：新 session 不重读代码能答出机制怎么工作。
- 运行时生效 ≠ 持久化：新 agent 文件需重启 CLI；新 hook 下次触发生效；skill 立即生效；CLAUDE.md / rules 只对新 session 生效。
- 改完当次会话必须 push system repo（`scripts/push-all.sh`；2026-06-05 教训：未 push 的改动被 pull-all 覆盖丢失）。
- 作用域判定："谁承载谁文档化"——文件在 `~/.claude/` 下写本文件，在项目内写项目 CLAUDE.md；禁止跨作用域复制，允许单向引用。
- 三类事件当次会话内落文档：重要新增 / 改动；同一问题卡 ≥30 分钟或跨会话未解；重要非代码决策（`**Decisions:**` 格式）。

## Sessions Board（多 Claude session 协调）

文件：`~/.claude/state/sessions-board.md`（全局软协调层，worktree 是硬隔离重武器）。

**必读时机**：① session 开始 ② 改仓库级共享文件（worker.json / master.json / scripts / hooks / CLAUDE.md）③ 启占端口 process ④ spawn 修改类后台 agent ⑤ `git stash/reset/commit` 前 ⑥ `git status` 有不认识修改时。

**必写时机**：① session 开始（写 entry：worktree+doing+touching+holds+don't touch+next）② 长 process 启动更新 holds ③ 改共享文件更新 touching ④ commit 前后更新 ⑤ spawn 修改类 agent 更新 next ⑥ 长任务切换大方向更新 doing+next ⑦ session 结束移到 `## History`。

**与 Worktree 关系**：同项目两 session 跑实例 → 必须 worktree 隔离 + board entry。Sub-agent 改 working tree 仍按 §多 Worktree 铁律走，board 不替代。

**反模式**：next 字段失同步（写"明天"实际今晚做了）/ doing 太宽泛 / 不写 don't touch / 结束不清理。

完整 Entry schema / 详细触发清单 / 失效与清理规则详见 `~/.claude/on-demand/sessions-board.md`。

## 多 Worktree / Sub-agent Git 隔离（强制）

> 2026-05-05 事故：后台 agent 在共享 worktree 内 `git stash` / `pop` 吞掉主 session 的 staging，16 个文件从 commit 丢失。全文与多 session 资源冲突清单见 `~/.claude/on-demand/git-isolation.md`。

1. 共享 worktree 内的 sub-agent **禁止**任何改 index / working tree 的 git 操作：stash、checkout / switch、reset / restore、add / rm / mv、commit / revert / cherry-pick / rebase / merge、clean。
2. 只允许 read-only：log / show / diff / status / rev-parse / cat-file / ls-files / blame / config --get。
3. 需要在别的 ref 上跑测试时用 `Agent(isolation: "worktree")`。
4. spawn 修改类 agent（含 codex review、reality checker、code-reviewer）的 prompt 末尾必须附：
   ```
   约束：你在主 session 共享的 git worktree 内运行。禁止 `git stash` / `git checkout <ref>` / `git reset` / `git restore` / `git add` / `git rm` / `git commit` 等修改 index/working-tree 的操作——主 session 可能正在 staging 文件。只允许 read-only：`git log` / `git show` / `git diff` / `git status` / `git rev-parse`。需要 baseline 对比时报告 "需要 isolation worktree"。
   ```
5. 多 Claude session 并行跑实例：`git worktree add` 隔离 + 端口 / worker_id / DB / 日志独立；项目内 SESSION2.md 是具体配置；全局共享的 `~/.cchft-secret`、`~/.memory/` 会互踩。

## Cross-Session Doc-vs-Code 配对铁律（强制）

> 2026-05-20 事故：收尾 commit `04536bc` 在 KNOWN_ISSUES.md 夹带 10+ 条 `⏩ 已修`，对应代码 0 行落地（双重 grep 10/10 假阳性）。全文、验证清单与历史见 `~/.claude/on-demand/doc-code-pairing.md`。

1. 接手"另一会话已完成你继续收尾"时，code-only commit 与 docs-only commit 分开；docs commit body 带 `verified-by: <sha>`。
2. 任何 `⏩ 已修` / `✅ DONE` 标记必须能在同 PR 或先前 PR 内 grep 到对应符号；commit message 三选一 `verified-by:` / `verified-files:` / `verified-via:`（CCHFT `tools/git-hooks/commit-msg` 强制；2026-09-13 起它是 Rule 0 `home:` trailer 的特例）。
3. 收尾前逐条验证：新增 `⏩ 已修` → grep 符号 0 hits 即拒绝 commit；CHANGELOG 新条目 → 文件真在 working tree；ADR / SYSTEM 新段 → 组件真存在；未 merge main 的分支不得标已修。
4. 不信 continuation commit 的自述，自己 grep；doc 先于 code 的"占坑"会变成治理债。

## 错误教训日志

> 全部条目（13 条，2026-04-19 至 2026-06-27）已归档到 `~/.claude/on-demand/lesson-archive.md`，按需读。2026-09-13 起本节不再追加：新教训写 memory 目录（`MEMORY.md` 索引），本节曾是记忆的第 6 个家（Rule 0）。13 条里 12 条是 hooks / 模式机器 / 记忆管道自身的事故，这是简化 harness 的主要依据。
