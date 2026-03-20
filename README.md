# Triple-System + Level 8 Framework for Claude Code

Three complementary open-source systems integrated into one framework, extended with **Level 8 Autonomous Agent Team** capabilities.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Level 8: Autonomous Agent Team                              │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐  │
│  │Shared State│  │Sprint Memory│  │Autonomous Permissions │  │
│  │ board.json │  │ sprint-W*.md│  │  allowedTools config  │  │
│  └──────┬─────┘  └──────┬─────┘  └───────────┬───────────┘  │
│         └───────────┬───┘                     │              │
├─────────────────────┼─────────────────────────┼──────────────┤
│  Triple System      │                         │              │
│                     ▼                         ▼              │
│  ┌─ ECC (Infrastructure) ──────────────────────────────────┐ │
│  │  Hooks · Memory · Learning · 48 Commands · Multi-lang   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Superpowers (Process) ─────────────────────────────────┐ │
│  │  TDD · Systematic Debugging · Brainstorming · Quality   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Agency Agents (Expertise) ─────────────────────────────┐ │
│  │  78+ Specialized Personas · Domain Knowledge · Routing  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## The 8 Levels of AI Engineering

| Level | What | This Repo |
|-------|------|-----------|
| 1-2 | Autocomplete / Cursor | Baseline |
| 3 | Context Engineering | ✅ `rules/` `agents/` `skills/` `CLAUDE.md` |
| 4 | Compound Learning | ✅ `/learn` instincts, continuous-learning hooks |
| 5 | MCP Extensions | ✅ `mcp-configs/` templates |
| 6 | Feedback Loops | ✅ TDD + code-review + verification pipeline |
| 7 | Background Agents | ✅ Scheduled Tasks + background agent execution |
| **8** | **Autonomous Agent Team** | ✅ **shared-state + sprint-memory + auto-permissions** |

## What Level 8 Adds

### 1. Shared State — Multi-Agent Coordination
```
.claude/shared-state/
├── board.json       ← Global task board (agents read/write)
├── decisions.log    ← Append-only audit trail
├── README.md        ← Schema documentation
└── artifacts/       ← Agent handoff artifacts
```

Agents register themselves, claim tasks, detect file conflicts, and hand off work — all through a shared JSON board.

### 2. Sprint Memory — Mid-Term Cross-Session Memory
```
.claude/memory/
└── sprint-2026-W12.md  ← Auto-created per ISO week
```

Three-layer memory architecture:
- **Short-term**: Context window (single session)
- **Mid-term**: Sprint file (cross-session, weekly)
- **Long-term**: Instincts + session files (permanent)

### 3. Autonomous Permissions — 90% Hands-Free

Three permission tiers:
- **Auto-approve**: Read, search, test, lint, build, git status/diff/commit
- **Cautious auto**: git add, npm install, branch creation
- **Human required**: git push, deploy, delete, publish

## Quick Start

```bash
# Clone
git clone https://github.com/ailin546/claude-triple-system-level8.git
cd claude-triple-system-level8

# Install runtime files (gitignored, local only)
bash .claude/scripts/install-level8.sh

# Start using with Claude Code
claude
```

## Apply to an Existing Project

### 方式一：Git Submodule（推荐）

独立管理、按需更新，适合团队协作。详见 [SUBMODULE-GUIDE.md](./SUBMODULE-GUIDE.md)。

```bash
cd your-project

# 一键设置
bash /path/to/claude-triple-system-level8/.claude/scripts/setup-submodule.sh

# 提交
git add -A
git commit -m "chore: add claude system submodule"
```

### 方式二：直接复制

简单直接，但无法追踪版本更新。

```bash
# Copy .claude/ directory to your project
cp -r .claude/ /path/to/your-project/.claude/

# Copy CLAUDE.md
cp CLAUDE.md /path/to/your-project/

# Install runtime files
cd /path/to/your-project
bash .claude/scripts/install-level8.sh
```

## File Structure

```
.
├── CLAUDE.md                          ← Project instructions for Claude
├── .gitignore                         ← Excludes runtime data
└── .claude/
    ├── settings.json                  ← Hooks configuration
    ├── agents/                        ← 96 specialized agents
    ├── skills/                        ← 107 skills (including shared-state-sync)
    ├── commands/                      ← 48 slash commands
    ├── rules/                         ← 44 coding rules (common + per-language)
    ├── scripts/
    │   ├── hooks/                     ← 26 hook scripts (including Level 8 hooks)
    │   └── install-level8.sh          ← One-click Level 8 setup
    ├── strategies/                    ← Playbooks (including autonomous-permissions)
    ├── shared-state/
    │   └── README.md                  ← Schema docs (board.json created at runtime)
    ├── memory/                        ← Sprint files (created at runtime)
    ├── mcp-configs/                   ← MCP server templates
    └── examples/                      ← Workflow examples
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `/plan` | Plan implementation |
| `/tdd` | Test-driven development |
| `/code-review` | Code review |
| `/orchestrate` | Multi-agent workflow |
| `/save-session` | Save session + sprint memory |
| `/resume-session` | Resume with full context |
| `/learn` | Extract reusable patterns |
| `/verify` | Verification checks |

## Sources (all MIT)

| System | Source | What It Provides |
|--------|--------|-----------------|
| ECC | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) | Infrastructure: hooks, memory, commands |
| Superpowers | [obra/superpowers](https://github.com/obra/superpowers) | Process: TDD, debugging, quality gates |
| Agency Agents | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Expertise: 78 specialized personas |
| **Level 8** | **This repo** | **Autonomous agent coordination layer** |

## License

MIT
