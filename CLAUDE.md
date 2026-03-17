# Triple-System Development Framework

Three complementary systems integrated for Claude Code:

| Layer | System | Source | What It Provides |
|-------|--------|--------|-----------------|
| **Infrastructure** | [ECC](https://github.com/affaan-m/everything-claude-code) | affaan-m | Hooks, memory, learning, 48 commands, multi-language rules |
| **Process** | [Superpowers](https://github.com/obra/superpowers) | obra | TDD iron law, systematic debugging, brainstorming, quality gates |
| **Expertise** | [Agency Agents](https://github.com/msitarzewski/agency-agents) | msitarzewski | 78 specialized personas with domain knowledge |

## How They Work Together

```
User Request: "给用户系统加上OAuth登录"
    │
    ├─► ECC Infrastructure (自动触发)
    │   SessionStart → 加载上次会话状态
    │   PostToolUse → 自动格式化、类型检查
    │   Stop → 保存状态、提取模式、追踪成本
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

## Quick Commands (ECC)

| Command | Purpose | Command | Purpose |
|---------|---------|---------|---------|
| `/plan` | 规划实现 | `/verify` | 验证检查 |
| `/tdd` | 测试驱动开发 | `/learn` | 提取模式 |
| `/code-review` | 代码审查 | `/save-session` | 保存会话 |
| `/e2e` | E2E测试 | `/resume-session` | 恢复会话 |
| `/build-fix` | 修复构建 | `/harness-audit` | 审计配置 |

## Agent Routing (Agency Agents - auto)

| Task | Agent | Task | Agent |
|------|-------|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` | Security audit | `engineering-security-engineer` |
| API/Database | `engineering-backend-architect` | CI/CD/Docker | `engineering-devops-automator` |
| Mobile | `engineering-mobile-app-builder` | Code review | `engineering-code-reviewer` |
| AI/ML | `engineering-ai-engineer` | Architecture | `engineering-software-architect` |
| MCP tool | `specialized-mcp-builder` | Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` | Tests | `testing-api-tester` |

## File Structure

```
.claude/
├── settings.json      ← Hooks config (ECC)
├── agents/            ← 96 agents (Agency + ECC + Superpowers)
├── skills/            ← 106 skills (Superpowers + ECC)
├── commands/          ← 48 slash commands (ECC)
├── rules/             ← 44 rule files (common + per-language)
├── scripts/hooks/     ← 24 hook scripts (ECC)
├── strategies/        ← Playbooks & runbooks
├── mcp-configs/       ← MCP server templates
└── examples/          ← Workflow examples
```

## Sources (all MIT)

- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
- [obra/superpowers](https://github.com/obra/superpowers)
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
