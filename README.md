# Claude Triple-System + Level 8

[中文](#中文) | [English](#english)

---

<a id="中文"></a>

## 中文

一套面向 Claude Code 与 Codex 的共享轻量开发工作流；保留原生 Hooks 和按需专家能力，
统一任务分级、范围确认、计划、单次审查、验证与记忆语义。

### Codex 适配

本仓库同时维护一个不会修改 Claude 运行路径的 Codex 原生适配器：

```bash
bash adapters/codex/install.sh
```

Claude 继续使用现有 `.claude/`、`CLAUDE.md` 和 Hooks；Codex 使用由
`shared/workflow/` 生成并校验的 `adapters/codex/`。共享 manifest 映射两端的
路由、澄清、计划、验证、迭代、审查、诊断和交接能力。两端共享 `~/.memory/`
和项目级 `PROJECT/.memory/`，但不共享 Hook 锁、日志、会话和模式状态。设计边界见
[`docs/UNIFIED_WORKFLOW.md`](docs/UNIFIED_WORKFLOW.md)，Codex 使用方式见
[`docs/CODEX_USAGE.md`](docs/CODEX_USAGE.md)。

维护与防漂移检查：

```bash
python3 scripts/sync_workflow.py
python3 scripts/sync_workflow.py --check
```

### 系统架构

框架由共享流程内核、基础设施和按需能力组成：

```
┌─────────────────────────────────────────────────────────┐
│  Shared Workflow Kernel: Fast · Standard · Heavy         │
│  Confirm → Plan → Execute → Review → Verify → Summary    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ECC (基础设施)         hooks · 记忆 · 命令               │
│  Native Process         条件澄清 · 单次审查 · 验证门      │
│  Agency Agents (专业)   按需领域专家 Agent                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| 层 | 系统 | 来源 | 提供什么 |
|----|------|------|---------|
| 基础设施 | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hooks 生命周期管理、共享记忆、模式学习、28 个斜杠命令 |
| 流程 | Shared Workflow Kernel | 本项目 | Claude/Codex 同语义的轻量生命周期；Superpowers 活动入口已停用 |
| 专业 | [Agency Agents](https://github.com/msitarzewski/agency-agents) | msitarzewski | 26 个领域专家（安全、架构、前端、DevOps 等） |
| 协作 | 原生按需协作 | 本项目 | 只有独立、高价值子任务才使用多 Agent |

### 工作原理

#### 1. Hook 驱动的自动化

框架通过 Claude Code 的 Hook 机制在关键节点自动执行逻辑，无需手动干预：

| 时机 | 自动执行的操作 |
|------|--------------|
| **会话启动** (SessionStart) | 恢复上次会话状态、加载共享记忆、重置模式为 Fast |
| **工具调用前** (PreToolUse) | 拦截危险命令（`rm -rf`、`DROP TABLE`）、编辑范围守卫、自动模式升档 |
| **工具调用后** (PostToolUse) | 轻量格式化、`console.log` 警告、漂移检测、类型检查 |
| **会话结束** (Stop) | 抽取高价值记忆、持久化会话状态、成本追踪 |
| **上下文压缩前** (PreCompact) | 保存当前状态避免压缩丢失 |

#### 2. 三档模式路由

每个任务自动分配流程强度，Hook 按模式分层启用：

| 模式 | 触发条件 | 自动启用 |
|------|---------|---------|
| **Fast**（默认） | 写文档、单文件小改、配置微调 | 基础 Hook（安全守卫 + 轻量格式化 + 记忆摘要） |
| **Standard** | 跨文件功能开发、一般 bugfix | Fast + 漂移检测、质量门、类型检查、决策记忆 |
| **Heavy** | 认证/支付/权限/迁移/部署 | Standard + Execution Brief 确认、严格验证、按风险一次审查 |

**自动升档**：`pre-tool-escalate.js` 检测风险关键词（auth/payment/deploy）和跨文件累积（3 文件 → Standard，6 文件 → Heavy），5 分钟空闲自动重置。

#### 3. 共享记忆系统

三层记忆架构，跨会话、跨工具持久化知识：

```
.memory/
├── today.md       ← 当日工作日志（会话结束自动写入）
├── weekly.md      ← 本周摘要（次日自动归档）
└── long-term.md   ← 永久知识库
```

- 会话启动时自动加载 `long-term.md` → `weekly.md` → `today.md`
- 会话结束时自动抽取高价值信息（决策、约束、未完成事项）写入 `today.md`
- 跨日自动归档（today → weekly）

#### 4. 专家 Agent 按需路由

只有任务可独立拆分且确有收益时才选择专家 Agent；默认由主会话完成：

| 任务 | Agent | 任务 | Agent |
|------|-------|------|-------|
| React/Vue/CSS | frontend-developer | 安全审计 | security-engineer |
| API/数据库 | backend-architect | CI/CD/Docker | devops-automator |
| AI/ML | ai-engineer | 代码审查 | code-reviewer |
| 系统设计 | software-architect | 快速原型 | rapid-prototyper |

### 安装方式

#### 方式一：直接使用（学习/体验）

```bash
git clone https://github.com/ailin546/claude-triple-system-level8.git
cd claude-triple-system-level8
claude   # 启动 Claude Code
```

#### 方式二：作为子模块集成到现有项目

```bash
cd your-project
bash <(curl -sL https://raw.githubusercontent.com/ailin546/claude-triple-system-level8/main/install.sh) \
  https://github.com/ailin546/claude-triple-system-level8.git
```

这会自动：
1. 将框架添加为 `.claude-system/` 子模块
2. 符号链接 agents、skills、commands、rules 等到 `.claude/`
3. 复制 `settings.json`（Hook 配置）
4. 安装 git hook（后续 pull/checkout 自动重新链接）

**更新框架**：
```bash
bash .claude-system/install.sh --update
```

### 手动命令

以下命令在 Claude Code 对话中通过 `/命令名` 调用：

#### 核心命令

| 命令 | 说明 | 适用模式 |
|------|------|---------|
| `/plan` | 分析需求，生成分步实现计划，等待确认后再动手 | Standard+ |
| `/verify` | 运行 lint、类型检查、测试，用实际输出验证结果 | 所有模式 |
| `/code-review` | 对已写代码进行安全和质量审查 | Standard+ |
| `/build-fix` | 分析构建错误并修复 | 所有模式 |

#### 会话管理

| 命令 | 说明 | 适用模式 |
|------|------|---------|
| `/save-session` | 保存当前会话状态到文件，便于日后恢复 | Standard+ |
| `/resume-session` | 加载上次保存的会话，恢复完整上下文 | Standard+ |
| `/learn` | 从当前会话提取可复用模式，保存为 instinct | Standard+ |

#### 安全与控制

| 命令 | 说明 | 适用模式 |
|------|------|---------|
| `/careful` | 开关危险命令守卫（拦截 `rm -rf` 等） | 所有模式 |
| `/freeze` | 锁定编辑范围到指定目录，防止越界修改 | 所有模式 |
| `/unfreeze` | 解除编辑范围锁 | 所有模式 |
| `/harness-audit` | 审计当前 Hook 和配置状态 | 所有模式 |

#### 设计与审查

| 命令 | 说明 | 适用模式 |
|------|------|---------|
| `/design-consultation` | 多角度设计咨询（UI + UX + 无障碍） | Standard+ |
| `/design-review` | 实现完成后的设计审查 | Standard+ |
| `/codex:review` / `/codex:adversarial-review` / `/codex:rescue` | 通过官方 [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) 插件进行跨 AI 代码审查与任务委派（首次使用 `/codex:setup`） | Standard+ |
| `/e2e` | 生成并运行 Playwright E2E 测试 | Standard+ |

#### 推荐工作流

```
Fast 模式:    直接做 → /verify
Standard 模式: 必要时确认范围 → /plan → 实施 → 按风险一次 /code-review → /verify
Heavy 模式:    确认 Execution Brief → /plan → 实施 → 一次 /code-review → /verify
```

### 手动模式控制

模式通常自动判定，但可手动覆盖：

```bash
# 在 Claude Code 对话中让 Claude 执行：
node .claude/scripts/hooks/set-mode.js standard   # 升档到 Standard
node .claude/scripts/hooks/set-mode.js heavy       # 升档到 Heavy
node .claude/scripts/hooks/set-mode.js --reset     # 重置为 Fast
```

也可直接告诉 Claude：
- "直接做" / "走轻量流程" → 降档
- "需要完整审查" / "按重型流程来" → 升档

### 目录结构

```
.
├── CLAUDE.md                  ← 项目指令（Claude Code 自动加载）
├── install.sh                 ← 一键安装脚本（子模块模式）
├── setup-claude.sh            ← 链接脚本（符号链接框架到 .claude/）
├── .memory/                   ← 跨工具共享记忆
│   ├── today.md               ← 当日日志
│   ├── weekly.md              ← 周度摘要
│   └── long-term.md           ← 永久知识库
└── .claude/
    ├── settings.json          ← Hook 配置（所有 Hook 常驻注册，脚本内模式门控）
    ├── agents/                ← 26 个专家 Agent 定义
    ├── skills/                ← 29 个活动 Skill（共享流程 + 按需能力）
    ├── commands/              ← 28 个斜杠命令
    ├── rules/                 ← 11 个规则文件
    ├── scripts/hooks/         ← 29 个 Hook 脚本
    ├── strategies/            ← Playbook 和 Runbook
    ├── shared-state/          ← 多 Agent 任务板（Heavy 模式）
    ├── mcp-configs/           ← MCP server 模板
    └── examples/              ← 工作流示例
```

### 许可证

MIT

### 来源

- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT)
- [obra/superpowers](https://github.com/obra/superpowers)（MIT；仅保留历史来源署名，运行入口已停用）
- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (MIT)

---

<a id="english"></a>

## English

A shared lightweight workflow for Claude Code and Codex. It keeps native hooks and optional expert capabilities while unifying routing, scope confirmation, planning, bounded review, verification, and memory semantics.

### Codex Adapter

This repository also carries a native Codex adapter that does not modify the Claude runtime paths:

```bash
bash adapters/codex/install.sh
```

Claude continues to use the existing `.claude/`, `CLAUDE.md`, and hooks. Codex uses generated
artifacts under `adapters/codex/`. The shared manifest maps routing, clarification, planning,
verification, iteration, review, diagnostics, and handoff capabilities across both clients.
Both tools share `~/.memory/` and `PROJECT/.memory/`, while hook locks, logs, sessions, and mode
state remain tool-specific. See
[`docs/UNIFIED_WORKFLOW.md`](docs/UNIFIED_WORKFLOW.md) for the compatibility contract.
See [`docs/CODEX_USAGE.md`](docs/CODEX_USAGE.md) for the Codex-native lifecycle and usage.

Generate and check adapter drift with:

```bash
python3 scripts/sync_workflow.py
python3 scripts/sync_workflow.py --check
```

### Architecture

The framework consists of a shared process kernel, infrastructure, and on-demand capabilities:

```
┌─────────────────────────────────────────────────────────┐
│  Shared Workflow Kernel: Fast · Standard · Heavy         │
│  Confirm → Plan → Execute → Review → Verify → Summary    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ECC (Infrastructure)    hooks · memory · commands       │
│  Native Process          conditional scope · one review  │
│  Agency Agents           on-demand domain expertise      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| Layer | System | Source | What It Provides |
|-------|--------|--------|-----------------|
| Infrastructure | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hook lifecycle, shared memory, pattern learning, 28 slash commands |
| Process | Shared Workflow Kernel | This project | Lightweight Claude/Codex lifecycle; Superpowers entrypoints are disabled |
| Expertise | [Agency Agents](https://github.com/msitarzewski/agency-agents) | msitarzewski | 26 domain experts (security, architecture, frontend, DevOps, etc.) |
| Coordination | Native on-demand collaboration | This project | Multi-agent use only for bounded, high-value independent work |

### How It Works

#### 1. Hook-Driven Automation

The framework uses Claude Code's Hook mechanism to automatically execute logic at key lifecycle points — no manual intervention needed:

| Timing | Automated Actions |
|--------|------------------|
| **Session Start** (SessionStart) | Restore previous session state, load shared memory, reset mode to Fast |
| **Before Tool Use** (PreToolUse) | Block dangerous commands (`rm -rf`, `DROP TABLE`), edit scope guard, auto mode escalation |
| **After Tool Use** (PostToolUse) | Light formatting, `console.log` warnings, drift detection, type checking |
| **Session End** (Stop) | Extract high-value memory, persist session state, cost tracking |
| **Before Compaction** (PreCompact) | Save state before context compression |

#### 2. Three-Tier Mode Routing

Each task is automatically assigned a process intensity level. Hooks are layered by mode:

| Mode | Trigger | Auto-Enabled |
|------|---------|-------------|
| **Fast** (default) | Docs, single-file edits, config tweaks | Basic hooks (safety guard + light formatting + memory summary) |
| **Standard** | Multi-file feature dev, general bugfixes | Fast + drift detection, quality gate, type checking, decision memory |
| **Heavy** | Auth/payment/permissions/migration/deploy | Standard + confirmed Execution Brief, strict verification, one risk-based review |

**Auto-escalation**: `pre-tool-escalate.js` detects risk keywords (auth/payment/deploy) and cross-file accumulation (3 files → Standard, 6 files → Heavy). Resets after 5 minutes idle.

#### 3. Shared Memory System

Three-layer memory architecture for cross-session, cross-tool knowledge persistence:

```
.memory/
├── today.md       ← Daily work log (auto-written at session end)
├── weekly.md      ← Weekly summary (auto-archived next day)
└── long-term.md   ← Permanent knowledge base
```

- Auto-loaded at session start: `long-term.md` → `weekly.md` → `today.md`
- High-value information (decisions, constraints, open items) auto-extracted at session end
- Cross-day auto-archival (today → weekly)

#### 4. Expert Agent On-Demand Routing

Expert agents are selected only when a bounded independent subtask benefits from them; the main session is the default:

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | frontend-developer | Security audit | security-engineer |
| API/Database | backend-architect | CI/CD/Docker | devops-automator |
| AI/ML | ai-engineer | Code review | code-reviewer |
| System design | software-architect | Rapid prototype | rapid-prototyper |

### Installation

#### Option 1: Direct Use (learning/exploration)

```bash
git clone https://github.com/ailin546/claude-triple-system-level8.git
cd claude-triple-system-level8
claude   # Start Claude Code
```

#### Option 2: Integrate as Submodule into Existing Project

```bash
cd your-project
bash <(curl -sL https://raw.githubusercontent.com/ailin546/claude-triple-system-level8/main/install.sh) \
  https://github.com/ailin546/claude-triple-system-level8.git
```

This automatically:
1. Adds the framework as a `.claude-system/` submodule
2. Symlinks agents, skills, commands, rules, etc. to `.claude/`
3. Copies `settings.json` (hook configuration)
4. Installs git hooks (auto-relinks on subsequent pull/checkout)

**Update the framework**:
```bash
bash .claude-system/install.sh --update
```

### Manual Commands

These commands are invoked via `/command-name` within a Claude Code conversation:

#### Core Commands

| Command | Description | Mode |
|---------|-------------|------|
| `/plan` | Analyze requirements, generate step-by-step plan, wait for confirmation | Standard+ |
| `/verify` | Run lint, type check, tests; verify with actual output | All modes |
| `/code-review` | Security and quality review of written code | Standard+ |
| `/build-fix` | Analyze and fix build errors | All modes |

#### Session Management

| Command | Description | Mode |
|---------|-------------|------|
| `/save-session` | Save current session state for later restoration | Standard+ |
| `/resume-session` | Load last saved session with full context | Standard+ |
| `/learn` | Extract reusable patterns from current session | Standard+ |

#### Safety & Control

| Command | Description | Mode |
|---------|-------------|------|
| `/careful` | Toggle dangerous command guard (blocks `rm -rf`, etc.) | All modes |
| `/freeze` | Lock edits to a specific directory | All modes |
| `/unfreeze` | Remove edit scope lock | All modes |
| `/harness-audit` | Audit current hook and config status | All modes |

#### Design & Review

| Command | Description | Mode |
|---------|-------------|------|
| `/design-consultation` | Multi-perspective design consultation (UI + UX + a11y) | Standard+ |
| `/design-review` | Post-implementation design review | Standard+ |
| `/codex:review` / `/codex:adversarial-review` / `/codex:rescue` | Cross-AI code review and task delegation via the official [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) plugin (first-time: `/codex:setup`) | Standard+ |
| `/e2e` | Generate and run Playwright E2E tests | Standard+ |

#### Recommended Workflows

```
Fast mode:     Just do it → /verify
Standard mode: confirm scope when needed → /plan → implement → one risk-based /code-review → /verify
Heavy mode:    confirm Execution Brief → /plan → implement → one /code-review → /verify
```

### Manual Mode Control

Mode is usually auto-determined, but can be manually overridden:

```bash
# Ask Claude to run in the conversation:
node .claude/scripts/hooks/set-mode.js standard   # Escalate to Standard
node .claude/scripts/hooks/set-mode.js heavy       # Escalate to Heavy
node .claude/scripts/hooks/set-mode.js --reset     # Reset to Fast
```

Or tell Claude directly:
- "Just do it" / "keep it lightweight" → downgrade
- "Full review needed" / "use heavy process" → upgrade

### Directory Structure

```
.
├── CLAUDE.md                  ← Project instructions (auto-loaded by Claude Code)
├── install.sh                 ← One-click installer (submodule mode)
├── setup-claude.sh            ← Linker script (symlinks framework to .claude/)
├── .memory/                   ← Cross-tool shared memory
│   ├── today.md               ← Daily log
│   ├── weekly.md              ← Weekly summary
│   └── long-term.md           ← Permanent knowledge base
└── .claude/
    ├── settings.json          ← Hook config (all hooks registered, mode-gated in scripts)
    ├── agents/                ← 26 expert agent definitions
    ├── skills/                ← 29 active skills (shared workflow + on-demand capabilities)
    ├── commands/              ← 28 slash commands
    ├── rules/                 ← 11 rule files
    ├── scripts/hooks/         ← 29 hook scripts
    ├── strategies/            ← Playbooks and runbooks
    ├── shared-state/          ← Multi-agent task board (Heavy mode)
    ├── mcp-configs/           ← MCP server templates
    └── examples/              ← Workflow examples
```

### License

MIT

### Sources

- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT)
- [obra/superpowers](https://github.com/obra/superpowers) (MIT; historical source only, runtime entrypoints disabled)
- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (MIT)
