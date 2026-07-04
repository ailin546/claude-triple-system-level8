# Agent Orchestration

> 本文件覆盖**基础设施 agent**（流程纪律：planner/tdd-guide/code-reviewer 等，lowercase frontmatter 名）。**专长 agent**（领域知识：Frontend Developer/Backend Architect 等，Capital Phrase 名）见 `~/.claude/CLAUDE.md` §Agent 路由。spawn 时一律用 frontmatter `name` 字段值。

## Available Agents (基础设施)

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| database-reviewer | DB query/schema review | When writing SQL/migrations |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent
5. UI/UX work starting - Use **design-consultation** skill (auto-trigger, see below)
6. UI code just written - Use **design-review** skill (auto-trigger, see below)

## Design System Auto-Trigger

When the task involves UI/visual changes, the design system activates automatically:

**Before implementation** — auto-invoke `design-consultation` skill when the request involves:
- New pages, screens, or layouts
- New UI components (buttons, forms, cards, modals, navigation)
- Color, typography, or spacing changes
- Responsive design or dark mode work
- UX flow changes or information architecture

**After implementation** — auto-invoke `design-review` skill when:
- CSS/SCSS/styling files have been created or modified
- Component files (.tsx/.jsx/.vue/.svelte) with visual elements were changed
- Design tokens or theme variables were added/modified

Detection: if changed files match `*.css|*.scss|*.less|*.tsx|*.jsx|*.vue|*.svelte` AND contain visual keywords (color, margin, padding, font, display, grid, flex, background, border, shadow, theme), auto-trigger design-review before code-review.

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## Audit Task Routing（强制）

当用户要求全局性审查/审计时，**必须遵循 `~/.claude/on-demand/audit-protocol.md`**（按需加载，不在 common 下自动加载）；走 `/audit` 或 `/audit-crate` 命令时由命令入口显式引入。不可自行编排。

关键约束：
1. **Explore agent 不出结论** — 只做信息收集，HIGH+ 判定必须由有 Bash 能力的 agent 或主 agent 验证
2. **安全独立启动** — security-reviewer 必须作为独立 agent，不可合并到功能审计
3. **主 agent 亲自验证** — 所有 HIGH+ 发现必须由主 agent 运行验证命令确认
4. **4 阶段流程** — 信息收集 → 安全审计 → 主 agent 验证 → 对抗性审查

## Agent 删除扫描清单（强制）

> 2026-05-20 教训：删除 `engineering-code-reviewer.md` 时初版只扫 `agents/skills/commands/rules/CLAUDE.md/scripts`，漏 5 处真实活引用（scheduled-tasks / state / agents-orchestrator body / scripts/lib/model-map.js），靠 Reality Checker 二轮验证才补完。根因：agent 名有**两套并行约定**（frontmatter `name` 字段 + 文件-slug），且引用散落在非显眼目录。

**删除任意 `~/.claude/agents/*.md` 文件前，必须按本清单逐项 grep**（**两个名字都要扫**：frontmatter `name` + 文件-slug，例如 `Code Reviewer` 和 `engineering-code-reviewer`）。

### 必扫目录（含活引用，删错会断路由）

```
~/.claude/agents/             # 含 agents-orchestrator.md body 的团队清单
~/.claude/CLAUDE.md            # §Agent 路由表
~/.claude/commands/*.md        # subagent_type: 引用
~/.claude/rules/**/*.md        # agent 规则文档
~/.claude/rules-all/**/*.md    # 语言专属规则
~/.claude/skills/**/SKILL.md   # skill 内 spawn 指令
~/.claude/scheduled-tasks/**/SKILL.md  # 定时任务 spawn ⚠️ 易漏
~/.claude/state/sessions-board.md      # 多 session 协调 ⚠️ 易漏
~/.claude/scripts/lib/model-map.js     # 模型映射表 ⚠️ 易漏
~/.claude/scripts/hooks/*.js           # hook 内 spawn
~/.claude/on-demand/*.md       # 按需加载规则
~/.claude/settings.json /.claude/settings.local.json
```

### 可忽略（只读历史快照，改了无意义）

```
~/.claude/backups/
~/.claude/agents-archive/ commands-archive/ skills-archive/
~/.claude/projects/**/*.jsonl          # session transcript
~/.claude/sessions/                    # session 历史
~/.claude/file-history/                # 编辑历史
~/.claude/plugins/cache/ plugins/data/ # plugin 缓存与运行时
~/.claude/plugins/marketplaces/        # 未安装 plugin
```

### 区分真引用 vs 描述性短语

- ✅ 真引用（必须改）：
  - `subagent_type: "..."` 字面 spawn
  - `` `code-reviewer` `` 反引号包裹
  - 列表项如 `- **engineering-xxx**: ...`
  - model-map 表 key
  - **ASCII art / 流程图 / 示意图中的 agent 名**（如 evaluation-loop SKILL.md Step 4 流程框）— 2026-05-20 演练补充
- ❌ 描述性短语（保留）：`You are a Senior Code Reviewer` / 历史 commit 消息提及 / **错误教训日志中的历史变更记录**（"新增 X agent..." 这类）

### `scripts/lib/model-map.js` 是可选注册

agent 在 model-map.js 里 → spawn 时按表查模型；不在 → 用默认 model。删除 agent 时**如果有**就清，**没有**也不算漏（演练实证：systems Reality Checker 从未在 map 里，删除时 model-map 无需变更）。

## 新增机制注册清单（强制）

> 2026-05-20 工程性指标审计：系统可演进性 6/10 缺口 G1（无新增清单）。本节是 §Agent 删除扫描清单 的反方向对应。最小清单，不是流程制度。

加新机制前**先 read 现有最近 3 个同类样本**（grep 找：hook → settings.json 现存条目；agent → agents-orchestrator team list；skill → INDEX.md；mode 入口 → mode-trace.jsonl 现有 trigger 值），避免无意识扩张。

### 新增 hook

- [ ] **先评估：是否真需要？现 34 个 hook 已多**（settings.json 注册 vs 文件数差异先排查死代码）
- [ ] 写 `~/.claude/scripts/hooks/X.js`
- [ ] 注册到 `~/.claude/settings.json` 对应 trigger（PreToolUse/PostToolUse/Stop/SessionStart/PreCompact）
- [ ] 写 `~/.claude/rules/common/infrastructure.md` §Hooks System 表行（Always-on / Standard+ / Heavy-only 之一）
- [ ] 如 mode 联动 → 加 `requireMode('...')` gate
- [ ] 如有 stderr 注入文案 → 遵守 §Hook 文案锚点规则（不写裸数字章节号）
- [ ] 如有状态文件 → 路径 + cleanup 策略（默认 `~/.claude/state/<hook-name>.json`）
- [ ] 如 hook-enforced schema（如 evaluation-gate marker）→ **必须**同步写 `infrastructure.md` SSOT 段：分开声明"hook 严格校验字段"和"信息字段"，逐字段引用实现行号（2026-05-20 D2 教训：文档凭直觉强于实现）
- [ ] 不变量 cross-check：与 careful-guard / evaluation-gate / pre-tool-escalate 是否互锁？
- [ ] **必测边界**（M4 标杆 2026-05-20）：hook 涉及 ① state file 写入 ② mode gate ③ exit 1/2 阻断 ④ stderr 注入改 Claude context ⑤ regex/parser 解析配置内容 — **任一为真必须配单测**。零依赖模板与 5 类边界详见 `~/.claude/scripts/hooks/__tests__/README.md`（标杆：careful-guard.test.js / evaluation-gate.test.js / fix-depth-check.test.js）

### 新增 agent

- [ ] 写 `~/.claude/agents/<scope>-<name>.md`（scope 前缀：ecc-/engineering-/testing-/superpowers-/agents-）
- [ ] frontmatter `name` 字段**不能与现有任何 agent 同名**（normalize 后比较 lowercase/Capital）
- [ ] 更新 `~/.claude/scripts/lib/model-map.js`（如按非 default 模型 spawn）
- [ ] 更新 `~/.claude/agents/agents-orchestrator.md` team list 段
- [ ] 更新 `~/.claude/CLAUDE.md §Agent 路由` 或 `~/.claude/rules/common/agents.md`
- [ ] 引用扫描预演：模拟"如果未来要删 X agent"，预扫 §Agent 删除清单 13 目录确认引用最小

### 新增 skill

- [ ] 写 `~/.claude/skills/<name>/SKILL.md`（frontmatter 仅 `name` + `description`）
- [ ] description 是 "Use when..." 触发条件，不是 workflow 摘要
- [ ] 更新 `~/.claude/skills/INDEX.md`（必须有条目）
- [ ] 与 plugin skill 同名时加 `ecc-*` / 域名前缀显式区分
- [ ] 重叠 skill description 末尾加 "For X use other-skill" 互引

### 新增 mode 入口

- [ ] **先评估：是否真需要？现有 5 个入口已多**（task-router / set-mode / pre-tool-escalate / user-prompt-classify / 5min idle reset）
- [ ] 在 mode-trace.jsonl 写入新 `trigger` 值，命名独一无二
- [ ] 在 `~/.claude/rules/common/infrastructure.md` §模式升档机制 加描述
- [ ] 与 set-mode --reset cooldown 互锁验证（不会反向闭环）

## 机制变更完成门（强制）

> 2026-05-20 工程性指标审计：可演进性 7/10 缺口"无完成检查点"。本节是 §新增机制注册清单 + §Agent 删除扫描清单 + §Hook 文案锚点规则的**统一完成验证**，不是新流程。

**触发场景**（任一为真都必须跑完成门）：
- 新增 hook / agent / skill / mode 入口 / command
- 删除 hook / agent / skill / command
- 重命名（含 frontmatter `name` 字段改动 / file-slug 改动）
- 修 hook stderr 文案锚点
- 改 manifest（INDEX.md / model-map.js / agents-orchestrator team list / settings.json）
- 改 CLAUDE.md / rules/common/ 中的章节结构
- **改 hook 实现/输出格式/退出码/输入数据契约/加载条件/settings.json schema 字段语义**（即使 stderr 文案不变）— 2026-05-20 Codex M3 反馈：实现/契约变更不应只靠"文案变了才跑"触发

**三 utility 串联**（按顺序跑，**全部**只读无副作用）：

```bash
# 1. 系统级 drift 扫 (M1, 含 D1-D5 五类)
node ~/.claude/scripts/utils/manifest-generate.js --drift-only

# 2. 跨命名空间冲突 (M2, 含 N1-N4 四层 severity)
node ~/.claude/scripts/utils/namespace-check.js

# 3. SessionStart 上下文影响 (仅在改了 CLAUDE.md / rules/common 时跑)
node ~/.claude/scripts/utils/rules-load-snapshot.js
```

**接受标准**（任一不达不算完成）：
- M1 `Total drift items` 仅含 follow-up 已记录的 D1（其他 D2-D5 必须 0）
- M2 `Hard: 0` 强制；`Review` 数不增加 — **基线制度**：变更前跑 `namespace-check.js > /tmp/nscheck-pre.txt`，变更后跑 `namespace-check.js > /tmp/nscheck-post.txt` + `diff` 对比 Review 列表。新增 Review 项必须在本次 PR/commit message 写明"acked 理由"或解决后才算通过（防"口头判断 Review 没增"）
- M3 仅当改 SessionStart 加载内容时，验证 token 变化与变更预期一致（不要求"必减"，要求"有意识 trade-off"）

**违反检测 + 具体回填动作**（成本 = 漏跑 → 系统漂移）：

漂移历史回顾：A1 / 8 hook 锚点 / D1/D2/D3 SSOT 全部因"变更后未跑完成门"导致；本机制是反向力。

未来若 Reality Checker / Codex 反审抓出漂移，按下表回填（不允许只"承诺以后注意"）：

| 漂移类型 | 必填动作 |
|---|---|
| 本可由三 utility 检出但漏跑 | 更新完成门接受标准（提高严格度） + 在 lesson-archive 加 entry |
| 三 utility 现有检测不覆盖 | 登记为新 **detection gap**：选择 ① 纳入 M5a/M6 扩展 detection 范围 ② 明确豁免并说明理由（不能两边都选） |
| 完成门已跑但仍有遗漏 | 修补 utility 检测面（M1/M2 加新 Dx/Nx）+ lesson-archive 加 entry |
| 触发场景未识别 | 补本节"触发场景"列表 |

**与已有清单的关系**：
- §新增机制注册清单 = 变更**前**的设计约束
- §Agent 删除扫描清单 = 变更**中**的引用扫描
- §机制变更完成门 = 变更**后**的统一验证（本节）
- 三者覆盖完整生命周期，避免 §自演进铁律仅靠纪律

## Hook 文案锚点规则（强制）

User-level hook（`~/.claude/scripts/hooks/*.js`）注入文案引用 CLAUDE.md 章节时：

- ❌ 禁止裸数字章节号（hook 跑在所有项目，数字号假设特定项目级 CLAUDE.md）
- ✅ 必须前缀作用域：user-level 用 `~/.claude/CLAUDE.md §稳定章节名`，项目级用 `PROJECT/CLAUDE.md §章节名`
- ✅ 稳定章节名优先于编号（编号随重排变化，名是语义锚点）

**违反检测**：`grep 'CLAUDE\.md §[0-9一二三四五六七八九十百]\|§[0-9一二三四五六七八九十百].*½' ~/.claude/scripts/hooks/*.js | grep -v 'PROJECT/CLAUDE.md\|~/.claude/CLAUDE.md'` 应 0 hits。

### 反向 TODO 检测

删除 agent 时同步搜任何评估清单/待办文档中**意图相反**的待办（`- [ ] 保留 X 删除 Y` 当你做的是相反操作时），标记 `[x] DONE YYYY-MM-DD (做法相反: ...)`，避免未来盲执行。
