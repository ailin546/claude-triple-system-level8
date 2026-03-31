# Triple-System Development Framework

> **所有内容用中文回复。**

Three complementary systems integrated for Claude Code:

| Layer | System | Source | What It Provides |
|-------|--------|--------|-----------------|
| **Infrastructure** | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hooks, memory, learning, 28 commands, common rules |
| **Process** | [Superpowers](https://github.com/obra/superpowers) | obra | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | [Agency Agents](https://github.com/msitarzewski/agency-agents) | msitarzewski | 26 active agents with domain knowledge |

## How They Work Together

```
User Request: "给用户系统加上OAuth登录"
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
        Security Engineer → 审计OAuth安全性
        Backend Architect → 设计认证架构
        Code Reviewer → 专业检查清单审查
```

## Priority Order

1. **User's explicit instructions** — always highest
2. **ECC hooks & rules** — infrastructure (100% reliable)
3. **Superpowers skills** — process/workflow (HOW)
4. **Agency Agents personas** — expertise/identity (WHO)

---

## 任务模式路由

> 详细规则见 `.claude/rules/routing.md`（自动加载）。

**推荐命令链**：
- Fast：直接做 → `/verify`
- Standard：`/plan` → 实施 → `/verify`
- Heavy：`/plan` → `/tdd` → 实施 → `evaluation-loop` → `/code-review` → `/verify`

---

## 一致性原则

1. **先质疑假设，再动手** — 不接受"惯例"作为理由，从事实出发
2. **不重复** — 遵守 SSOT，不引入已有功能的重复实现
3. **不破坏** — 引入新依赖或破坏现有接口前，必须获得用户确认

具体检查由 `/code-review` 命令和 `rules/` 下的规则文件执行（自动加载）。

---

## Quick Commands (ECC)

核心命令：

| Command | Purpose | 适用模式 |
|---------|---------|---------|
| `/plan` | 规划实现 | Standard+ |
| `/tdd` | 测试驱动开发 | Standard+ |
| `/verify` | 验证检查 | 所有模式 |
| `/code-review` | 代码审查 | Standard+ |
| `/build-fix` | 修复构建 | 所有模式 |
| `/save-session` / `/resume-session` | 保存/恢复会话 | Standard+ |
| `/careful` | 危险命令守卫开关 | 所有模式 |
| `/freeze` / `/unfreeze` | 编辑范围锁 | 所有模式 |
| `/codex` | 跨AI审查（Codex） | Standard+ |

全部命令见 `.claude/commands/`（`/` 自动补全）和 `.claude/skills/`（自动触发）。

## Agent Routing (Agency Agents - auto)

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| AI/ML | `engineering-ai-engineer` | Code review | `engineering-code-reviewer` |
| Architecture | `engineering-software-architect` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |
| DB optimization | `engineering-database-optimizer` | Git workflow | `engineering-git-workflow-master` |
| Technical docs | `engineering-technical-writer` | Performance | `testing-performance-benchmarker` |

### 风险控制

当前系统采用**全权限 + hook 守卫**模式：
- 权限和 hooks 配置在用户级 `~/.claude/settings.json`，所有项目共享
- 项目级 `.claude/settings.json` 只保留项目特有权限（如 MCP），不重复 hooks
- 风险由运行时 hook 守卫承担：`careful-guard`（阻断破坏性命令）、`freeze-guard`（编辑范围锁）、`pre-tool-escalate`（自动升档）

### 降级策略

Hook 失败时：Always-on 记 warning 继续，Standard+ 降为 Fast，Heavy 降为 Standard。
详见 `docs/claude-triple-system-level8-redesign/recovery.md`。

## 记忆系统（双层）

记忆分两层：**全局**（跨项目）和**项目级**（项目专属）。

```
~/.memory/                          ← 全局（跨项目）
├── index.md                        ← 项目索引（hook 自动维护）
├── today.md                        ← 跨项目当日日志
└── long-term.md                    ← 跨项目永久知识

PROJECT/.memory/                    ← 项目级（各项目独立）
├── RULES.md                        ← 使用规则
├── today.md / weekly.md / long-term.md
```

**读取**（SessionStart，Always-on）：
- `session-start.js` 先读全局 `~/.memory/`（long-term → today），再读项目 `PROJECT/.memory/`（long-term → weekly → today）
- 目录或文件缺失时静默跳过

**写入**（双轨）：
- **Claude 主动写**（主要）：项目工作写 `PROJECT/.memory/today.md`，跨项目洞察写 `~/.memory/today.md`。规则见 `rules/common/session-memory.md`
- **stop-summary.js**（辅助，Always-on）：只记录元数据 + 自动维护 `~/.memory/index.md`
- Heavy：`shared-memory-sync.js`（Heavy-only）执行完整会话同步和每日归档

**每日轮转**：
- `stop-summary.js`（Always-on）和 `shared-memory-sync.js`（Heavy）都包含轮转逻辑
- 检测到 today.md 日期非今日时，自动归档到 weekly.md 并重置

**多设备/多 AI 同步**（可选，需配置）：
- `.memory/` 可作为独立 git 仓库，实现跨设备、跨 AI 工具共享
- 启用方式：`bash .claude/scripts/memory-init.sh <remote-url>`
- SessionStart 自动 `git pull`，Stop 自动 `git commit + push`
- 配置存储在 `.claude/.memory-remote`（不入库）
- 未配置时所有同步逻辑为 no-op，不影响现有行为

**自动沉淀到 CLAUDE.md**（每日一次）：
- `stop-summary.js` 扫描记忆文件中的重复模式和教训
- 出现 2+ 次的显式 `→` 格式教训自动写入 CLAUDE.md 错误教训日志
- 写入条目带 `[auto]` 标记，每次最多 5 条

详细规则见 `.memory/RULES.md`。

## 错误教训日志

> 被用户纠正或自行发现的错误记录于此，每次会话自动加载，避免重复犯错。
> 格式：`- [日期] 错误描述 → 正确做法`

<!-- 新错误追加在此行下方 -->

- [2026-03-25] 两个 CLAUDE.md 不同步导致规则冲突 → 改一处必须同步另一处
- [2026-03-25] Hook 未做环境检查，缺依赖时阻塞整个流程 → hook 必须优雅降级
- [2026-03-30] Hook 的 mode gate catch 分支 fallthrough 导致非目标模式也执行 → catch 中必须也做 stdin 透传 + exit，不能空 catch 后继续执行
- [2026-03-30] Hook 不应 dump 用户原始消息到记忆文件 → 实质内容由 Claude 会话内主动写，hook 只记元数据

---

## Sources (all MIT)

- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
- [obra/superpowers](https://github.com/obra/superpowers)
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
