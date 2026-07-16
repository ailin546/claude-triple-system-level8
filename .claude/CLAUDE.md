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
    │   brainstorming → 探索/拷问需求(grill)、生成设计文档
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
| AI/ML | `AI Engineer` | Code review | `code-reviewer` |
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

全权限 + hook 守卫模式（配置在用户级 `~/.claude/settings.json`）。完整 hook 行为表 + 升档/降级机制详见 `~/.claude/rules/common/infrastructure.md`。

### Long-term correctness 守卫（2026-05-01 反向力机制）

> 背景：用户元反思发现 Claude 长期默认"快速能用"而非"长期正确"。本机制是反向力。

| 机制 | 守什么 |
|------|--------|
| §编码行为准则 重排 | Rule 1 根因优先 > Rule 2 精准改动 > Rule 3 过度设计 |
| `user-prompt-classify` hook | fix/bug 关键词自动升 standard + 首条 prompt 注入深度评估 |
| `fix-depth-check` hook | fix-only commit 缺根因 → stderr 软警告 |
| `set-mode --reset` 加固 | `--reason` ≥10 字符 + 20min cooldown + 可疑词阻断（防 evaluation-gate 绕过） |
| `evaluation-gate` | Heavy 模式 `git commit/push` 无 pass marker → exit 2 阻断（含 git_head pin 防 forge） |

**反模式自警**（说出/做出立刻警觉）：
- 说"症状级措辞"（详见 `on-demand/coding-discipline.md`）
- 被 evaluation-gate 阻断 → 第一反应 `--reset` 而非跑 `/evaluation-loop`
- bug 报告先想"如何最小修复"而非"为什么这个 bug 可能"
- 修了 schema 漂移类问题但不查"为什么没被任何检查抓到"
- 任务切碎成"做一段→报告→等批准"小循环（Discord 格式陷阱）

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
| `/caveman` | 输出压缩模式（~75% token 节省），结构化输出场景自动豁免 | 所有模式 |
| `/mode-explain` | 显示当前 mode + 历史变更（谁改的/何时/为什么），读 `.claude/logs/mode-trace.jsonl` | 所有模式 |
| `/codex:rescue` | 委派复杂任务/根因/二次实现给 Codex（详见 §Codex 调用规则） | 所有模式 |
| `/codex:review` `/codex:adversarial-review` | Codex 视角代码/对抗审查 | Standard+ |
| `/codex:setup` `/codex:status` `/codex:result` `/codex:cancel` | Codex 运行时管理 | 所有模式 |
| `/grill` | 对抗审查当前 diff（攻击者视角打破代码：边界/故障/隐式假设；与 /code-review 合规检查互补）。**需求级拷问**用 brainstorming skill 的 Interrogation discipline | Standard+ |
| `/audit` | Layer 3 多 Agent 全局审计（4 阶段协议；Step 0 先读 `on-demand/audit-protocol.md`） | Heavy |
| `/audit-crate` | 单个 Rust crate 的 agent team 审计（同 audit-protocol） | Heavy |
| `/design-consultation` | UI 实施前多视角设计咨询（UI Designer + UX Architect + Researcher 并行） | Standard+ |
| `/design-review` | UI 改动后设计审查（/code-review 的视觉对应物） | Standard+ |
| `/e2e` | Playwright 端到端测试：生成 journey + 运行 + 截图/视频/trace | Standard+ |
| `/test-coverage` | 覆盖率分析 + 补齐缺口到 80%+ | Standard+ |
| `/refactor-clean` | 死代码识别与安全删除（每步测试验证） | Standard+ |
| `/quality-gate` | 按需跑 ECC 质量管线（文件或项目范围） | 所有模式 |
| `/eval` | eval 驱动开发（EDD）工作流管理 | Standard+ |
| `/harness-audit` | 审计当前 repo 的 agent harness 配置，输出优先级记分卡 | 所有模式 |
| `/aside` | 不打断当前任务回答旁支问题，答完自动续上 | 所有模式 |
| `/checkpoint` | 创建/验证工作流 checkpoint | Standard+ |
| `/sessions` | 管理会话历史（list/load/alias/edit `~/.claude/sessions/`） | 所有模式 |
| `/memory-status` | 查看双轨记忆（系统级 + 项目级）状态 | 所有模式 |
| `/learn` / `/learn-eval` | 从当前会话提取可复用模式（learn-eval 含质量自评 + Global/Project 保存位置判定） | 所有模式 |
| `/restore` | 查看/恢复 `*-archive/` 中的归档组件 | 所有模式 |
| `/update-docs` | 文档与代码同步（从 source-of-truth 生成） | 所有模式 |
| `/codex`（本地遗留） | ⚠ 已被插件链取代——一律改用 `/codex:review`（§Codex 调用规则强制） | — |

全部命令见 `~/.claude/commands/` 和 `~/.claude/skills/`（skill 索引：`~/.claude/skills/INDEX.md`）。

## 记忆系统（双层）

双层：`~/.memory/`（全局跨项目）+ `PROJECT/.memory/`（项目独立）。**`.memory/` 不进 SessionStart system context**（不增加加载 token），只在 Claude 主动搜索或 `promoteLessons()` 回写时被引用。

**三个自动采集触发点**（共享 `extract-lessons.js`）：① Periodic hook 每 30 分钟、② PreCompact hook 压缩前、③ Stop hook 会话结束兜底。门控：无 commits + 无 lessons + 无 decisions → 不记录。

**`promoteLessons()` 关键行为**：扫 `.memory/today.md` / `weekly.md` / `long-term.md`，**出现 2+ 次的教训自动写回 CLAUDE.md**（这是 CLAUDE.md 持续增肥的来源 — 删条目无意义，必须从源头改 promote 策略）。

**Claude 写教训格式**（hook 自动提取依赖此格式，必须保持）：
```markdown
**Lessons:**
- 问题描述 → 正确做法
```

完整目录布局 / 三级流转规则 / 去重机制详见 `~/.claude/rules/common/workflow.md` §记忆系统。

## 编码行为准则

**三规则按优先级**：① 根因优先（fix/bug/事故时主导，压过其余）② 精准改动（非 fix 任务主导）③ 过度设计自检（新功能）。判定不清 → 默认走根因优先。

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

写完问自己**"高级工程师会嫌复杂吗"**。单次使用不写抽象类/策略模式/工厂；不加灵活性/可配置性/泛型；不为不可能场景写防御代码。

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
2. **不重复** — 遵守 SSOT
3. **不破坏** — 引入新依赖或破坏现有接口前，必须获得用户确认
4. **Outcome 优先** — 先确认用户要的结果（不是功能），再分析怎么做。诊断问题时用证据不用猜测 — 加日志、跑测试、看数据，禁止连续给出未经验证的不同猜测

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

## Sessions Board（多 Claude session 协调）

文件：`~/.claude/state/sessions-board.md`（全局软协调层，worktree 是硬隔离重武器）。

**必读时机**：① session 开始 ② 改仓库级共享文件（worker.json / master.json / scripts / hooks / CLAUDE.md）③ 启占端口 process ④ spawn 修改类后台 agent ⑤ `git stash/reset/commit` 前 ⑥ `git status` 有不认识修改时。

**必写时机**：① session 开始（写 entry：worktree+doing+touching+holds+don't touch+next）② 长 process 启动更新 holds ③ 改共享文件更新 touching ④ commit 前后更新 ⑤ spawn 修改类 agent 更新 next ⑥ 长任务切换大方向更新 doing+next ⑦ session 结束移到 `## History`。

**与 Worktree 关系**：同项目两 session 跑实例 → 必须 worktree 隔离 + board entry。Sub-agent 改 working tree 仍按 §多 Worktree 铁律走，board 不替代。

**反模式**：next 字段失同步（写"明天"实际今晚做了）/ doing 太宽泛 / 不写 don't touch / 结束不清理。

完整 Entry schema / 详细触发清单 / 失效与清理规则详见 `~/.claude/on-demand/sessions-board.md`。

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

## Cross-Session Doc-vs-Code 配对铁律（强制）

> 2026-05-20 事故触发：CCHFT 项目 commit `04536bc` (T4 Phase 2-lite, "backup automation" 任务) 通过 `docs/KNOWN_ISSUES.md +30 行`一次性夹带 10+ 条 `⏩ 已修` 声明（M-56 Phase 2 / M-62-M-87），但 commit 本身只交付 backup script，**对应代码改动 0 个落地**。配套 commit `aa6081e` (cross-session continuation) message 暴露根因："另一个会话已经完成，你继续收尾"+ "balance.rs/trade_history.rs 864 LOC dead WIP 被 Reality Check round 1 BLOCKER 拒掉 → unstaged"，但 KNOWN_ISSUES.md 中对应 `⏩ 已修` 标记**没相应回退** → doc 与 code 异步进入 main，10/10 双重 grep 验证 false-positive。
>
> 本铁律是反向力 — 把"声称完成"与"实际落地"硬绑定，防止 multi-session 协作下文档幻觉传播。

### 铁律 1: Multi-session 收尾 commit 必须 doc/code 分离

主 session 接手"另一个会话已完成你继续收尾"类任务时：
- ❌ 禁止一次性 commit 含 KNOWN_ISSUES.md/CHANGELOG.md/FEATURE_STATUS.md 新增"已修/已完成"标记 + 代码改动 + 文档改动混合包
- ✅ 必须拆成两个 commit：
  1. **code-only commit**：实现 + 测试 + 编译通过（pre-commit hook 验证）
  2. **docs-only commit**：标记 `⏩ 已修` / `✅ DONE`，commit body 含 `verified-by: <previous-code-commit-sha>` 字段

### 铁律 2: "声称完成"标记必须有可观察 grep 证据 + commit message 验证字段

新增 `⏩ 已修` / `⏩ 全部已修` / `⏩ 部分修` 到 KNOWN_ISSUES.md，或新增 `✅ DONE` 到 FEATURE_STATUS.md / OPTIMIZATION_BACKLOG.md 时：
- 必须能在 **同 PR 或先前 PR 内** grep 出对应符号 / 函数 / 文件
- commit message 必须含**三选一**字段（项目级 commit-msg hook enforce）：
  - `verified-by: <commit-sha>` — 修复实际所在的 commit
  - `verified-files: <file:line, file:line>` — grep 证据列表
  - `verified-via: <test-name | "retraction">` — CI/test 覆盖 或 状态降级
- 项目级实现参考：`tools/git-hooks/commit-msg`（CCHFT），新项目套用同一脚本

### 铁律 3: cross-session 收尾验证清单

主 session 接手收尾任务前**必须**逐项验证：
1. KNOWN_ISSUES.md 新增的每条 `⏩ 已修` → grep 对应符号 / ls 对应文件 → **0 hits 立即拒绝 commit**
2. CHANGELOG.md 新条目 → 对应 commit body 描述的代码改动文件**真在 working tree 内**（git status 验证）
3. ADR / SYSTEM.md 新增段 → 对应代码组件**真存在**（grep 主要 struct/trait 名）
4. 收尾 commit message 必须显式列出：哪些 work-stream 真做了（含 verified-by sha）/ 哪些被 Reality Check 拒掉（unstaged 列表）/ 哪些文档段落对应被拒掉的代码（必须同步回退或加 governance 告警块）

### 验证一项收尾改动是否"真持久化"

1. `git log --all -S "<关键 struct/fn/symbol 名>"` 找对应 commit
2. 若 0 hits → doc 声称已修但代码未落地 → 立即在 KNOWN_ISSUES.md 顶部加 ⚠️ 治理告警块标注偏差
3. 若有 commit 但被后续 revert → 检查 doc 是否同步降级（`⏩ → ⛔/⚠️`）
4. 若 commit 在 backup/* 或 claude/* 分支 + 未 merge main → doc 不应标 `⏩ 已修`

### 反模式（禁止）

- "另一会话完成的工作我打包一次性 commit" → 必拆 doc / code 两个 commit
- "看到 ⏩ 已修 标记就假设代码已落地" → 必须独立 grep 验证后再做下游决策（如 follow-up 排期、规划评估）
- "doc 写多了 code 来不及落，先 commit 占坑后面补" → 占坑会变成 false-positive 治理债，必须先 code 后 doc
- 仅依赖 cross-session continuation commit body 自述"Reality Check pass" → 必须自己 grep 验证，commit body 是 author 的视角，不是 verifier 的视角

### 历史教训

10/10 false-positive 事件:**M-56 Phase 2 / M-62 / M-63 / M-64 / M-65 / M-66 / M-67 / M-70 / M-86 / M-87** — 详见 `quant-deploy/docs/KNOWN_ISSUES.md` 顶部治理告警块（2026-05-20 双重 Claude + Codex grep 验证）。

---

## 错误教训日志

> 格式：`- [日期] 错误描述 → 正确做法`。完整 11 条历史归档见 `~/.claude/on-demand/lesson-archive.md`。

<!-- 新错误追加在此行下方。SessionStart 只保留最多 5 条核心铁律来源；非核心或已被规则吸收的旧条目移到 lesson-archive.md -->

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
- [2026-07-16] `pre-tool-escalate` 跨文件累积计数对批量 docs 任务无免疫（wikimind 单日 3 次：18 个 md 机械编辑约 90 秒打满 6 文件阈值 → 假升 heavy → evaluation-gate 拦 docs-only commit → reset 清计数但任务继续编辑剩余 md 立即重新累积 → 循环，第二次起需 `--force`）→ 根因：计数器是"跨模块代码复杂度"的代理信号，却对文件类型零区分，与 routing.md "写文档 → Fast" 自相矛盾（与 2026-06-13 hyphen 假阳性同类：启发式只按风险形态设计，无合法工作形态免疫）。修复：纯文档扩展名（md/markdown/rst/adoc/asciidoc/txt）不进 filesTracked（`isProseDocPath` + `trackFile` 纯函数 seam）；`.json`/`.yaml`/`.toml`/`.mdx` 仍计数（承载运行时行为，修假阳性不开假阴性）；未知扩展名/无扩展名计数（fail-closed）；风险信号路径检测（auth/ 等目录）不受影响。+6 单测（35 全过），完成门 M1 仅 pre-existing D1×7 / M2 Hard 0 Review 不增。**元教训：凡以数量/子串做代理信号的启发式，测试矩阵必须包含"合法高频工作形态"（批量 docs 编辑、含关键词的路径名）——设计时就要问"什么合法工作天然长这个形状"，而不是等生产假阳性后逐个打补丁**
