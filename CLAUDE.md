# Triple-System Development Framework

> **所有内容用中文回复。**

Three complementary systems integrated for Claude Code:

| Layer | System | Source | What It Provides |
|-------|--------|--------|-----------------|
| **Infrastructure** | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hooks, memory, learning, commands, common rules |
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

## 第一性原理 + 一致性守护协议

> 所有任务（含"直接给代码"）必须经过以下流程。不可省略、不可跳步。

### 思考协议（3 步）

**1. 分解到原子事实**
- 列出所有隐含假设，逐条质疑
- 拒绝"别人这么做""惯例""我觉得应该"等非第一性理由
- 明确：这个问题的不可争议的基本事实是什么？

**2. 从零重建方案**
- 只基于确认的事实和约束构建方案
- 选择最本质、最高内聚的路径，而非最快/最熟悉的
- 权衡记录：性能 vs 可读性 vs 维护成本 vs 扩展性

**3. 一致性强制校验**

在输出最终方案前，必须通过以下 7 项检查：

| # | 检查项 | 标准 | 阻断？ |
|---|--------|------|--------|
| 1 | **命名与风格** | 变量/函数/文件/路由命名、缩进、引号、import 顺序与项目现有代码一致 | 是 |
| 2 | **架构分层** | 遵守现有分层规则（领域层不调用 infra、hooks 优先等） | 是 |
| 3 | **契约与接口** | 输入输出类型、错误处理模式与调用方/被调用方一致 | 是 |
| 4 | **单一事实来源(SSOT)** | 无重复常量/类型/配置/逻辑 | 是 |
| 5 | **依赖一致** | 无未批准的新依赖/工具/库版本 | 是 |
| 6 | **文档/类型一致** | JSDoc/TS 类型/注释风格统一 | 是 |
| 7 | **测试通过** | 修改后 lint/type-check/测试预期通过 | 是 |

**评分**：7 项全 ✅ = 10 分。每项 ⚠️ 扣 1 分，每项 ❌ 扣 2 分。
**得分 < 9 或任何 ❌ → 触发一致性阻断**，禁止输出最终方案。

### 一致性阻断规则

以下任一情况**立即停止**，回复阻断模板：

- 任何检查项 ❌
- 得分 < 9
- 引入未批准新依赖/重大架构变更/核心契约破坏，未获用户授权
- 违反 SSOT 或防御性编程原则
- 跳过思考协议步骤

**阻断回复模板**：
```
⛔ 一致性阻断

违反项：
- [#N] 检查项名称：具体问题描述

当前得分：X/10
修复方案：...

是否授权继续？
```

---

## Quick Commands (ECC)

| Command | Purpose | Command | Purpose |
|---------|---------|---------|---------|
| `/plan` | 规划实现 | `/verify` | 验证检查 |
| `/tdd` | 测试驱动开发 | `/learn` | 提取模式 |
| `/code-review` | 代码审查 | `/save-session` | 保存会话 |
| `/e2e` | E2E测试 | `/resume-session` | 恢复会话 |
| `/build-fix` | 修复构建 | `/harness-audit` | 审计配置 |
| `/design-consultation` | 设计咨询 | `/design-review` | 设计审查 |
| `/careful` | 危险命令守卫 | `/freeze` / `/unfreeze` | 编辑范围锁 |
| `/codex` | 跨AI审查 | `/autoloop` | 自主迭代循环 |
| `/autoloop:debug` | 自主 bug 猎杀 | `/autoloop:fix` | 自主错误修复 |
| `/autoloop:security` | 自主安全审计 | `/autoloop:predict` | 多人格预测 |
| `/autoloop:scenario` | 场景探索 | | |

## Agent Routing (仅活跃 agents)

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| Code review | `engineering-code-reviewer` | Architecture | `engineering-software-architect` |
| AI/ML | `engineering-ai-engineer` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |

## File Structure (已审计 2026-03-23)

```
.claude/
├── settings.json      ← 21 个 Hook 配置（5 种类型）
├── agents/            ← 26 个活跃 agents
├── skills/            ← 39 个活跃 skills
├── commands/          ← 34 个活跃 commands (29 + 5 autoloop 子命令)
├── rules/common/      ← 10 个规则文件
├── rules-all/         ← 8 种语言的扩展规则（无 common 重复）
├── scripts/hooks/     ← 23 个脚本文件
├── strategies/        ← Playbooks & runbooks
├── mcp-configs/       ← MCP server templates
└── examples/          ← Workflow examples
```

### Hook 配置分布

| 类型 | 配置数 | 用途 |
|------|--------|------|
| PreToolUse | 5 | tmux 自动启动、危险命令守卫、冻结守卫、压缩建议、学习观察 |
| PostToolUse | 7 | 学习观察、漂移检测、质量门、自动格式化、类型检查、console.log 警告、故障提示 |
| Stop | 7 | 会话持久化、评估、成本追踪、状态同步、冲刺记忆、记忆整合、记忆提升 |
| PreCompact | 1 | 上下文压缩前保存状态 |
| SessionStart | 1 | 加载上次上下文、检测包管理器 |

> 注：`observe.sh` 位于 `skills/ecc-continuous-learning-v2/hooks/` 而非 `scripts/hooks/`

## Sources (all MIT)

- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
- [obra/superpowers](https://github.com/obra/superpowers)
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
