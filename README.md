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
│  │  21 Hooks · 3-Layer Memory · 34 Commands · Multi-lang   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Superpowers (Process) ─────────────────────────────────┐ │
│  │  TDD · Systematic Debugging · Brainstorming · Quality   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Agency Agents (Expertise) ─────────────────────────────┐ │
│  │  26 Active Agents · Domain Knowledge · Auto-Routing     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## The 8 Levels of AI Engineering

| Level | What | This Repo |
|-------|------|-----------|
| 1-2 | Autocomplete / Cursor | Baseline |
| 3 | Context Engineering | `rules/` `agents/` `skills/` `CLAUDE.md` |
| 4 | Compound Learning | `/learn` instincts, continuous-learning hooks |
| 5 | MCP Extensions | `mcp-configs/` templates |
| 6 | Feedback Loops | TDD + code-review + verification pipeline |
| 7 | Background Agents | Scheduled Tasks + background agent execution |
| **8** | **Autonomous Agent Team** | **shared-state + sprint-memory + auto-permissions** |

---

## What Level 8 Adds

### 1. Shared State — Multi-Agent Coordination

```
.claude/shared-state/
├── board.json       ← Global task board (agents read/write)
├── decisions.log    ← Append-only audit trail
├── README.md        ← Schema documentation
└── artifacts/       ← Agent handoff artifacts
```

Agents register themselves, claim tasks, detect file conflicts, and hand off work — all through a shared JSON board. The `shared-state-sync.js` hook automatically cleans up inactive agents (30min timeout) and archives completed workflows.

### 2. Sprint Memory — 3-Layer Cross-Session Memory

```
.claude/memory/
└── sprint-2026-W12.md  ← Auto-created per ISO week
```

| Layer | Scope | Lifetime | Mechanism |
|-------|-------|----------|-----------|
| **Short-term** | Context window | Single session | `sessions/*.tmp` |
| **Mid-term** | Sprint file | ~2 weeks | `sprint-memory.js` (Stop hook) |
| **Long-term** | Consolidated | Permanent | `memory-consolidate.js` (daily) |

Hook-driven data flow:
- `sprint-memory.js` → updates sprint file on every session end
- `memory-consolidate.js` → expired sprints → `long-term.md` (daily)
- `memory-promote.js` → cross-project instincts → system memory (daily)

### 3. Autonomous Permissions — 90% Hands-Free

Three permission tiers:

| Tier | Actions | Approval |
|------|---------|----------|
| **Auto-approve** | Read, search, test, lint, build, git status/diff/commit | Automatic |
| **Cautious auto** | git add, npm install, branch creation | Automatic with logging |
| **Human required** | git push, deploy, delete, publish | Manual approval |

---

## Hook System (21 Configurations, 23 Scripts)

All hooks are configured in `.claude/settings.json` and executed automatically.

### PreToolUse (5 hooks — before tool execution)

| Hook | What It Does |
|------|-------------|
| `auto-tmux-dev.js` | Auto-starts dev server in tmux (cross-platform) |
| `careful-guard.js` | Blocks `rm -rf`, `git push --force`, `DROP TABLE` etc. Toggle with `/careful` |
| `freeze-guard.js` | Restricts edits to a locked directory. Set with `/freeze src/auth` |
| `suggest-compact.js` | Suggests `/compact` every 50 tool calls at phase transitions |
| `observe.sh` | Continuous learning observation (in skills/ecc-continuous-learning-v2/) |

### PostToolUse (7 hooks — after tool execution)

| Hook | What It Does |
|------|-------------|
| `post-edit-format.js` | Auto-formats JS/TS/Rust after Edit (Biome/Prettier/rustfmt) |
| `post-edit-typecheck.js` | Runs `tsc --noEmit` after editing `.ts/.tsx` files |
| `post-edit-console-warn.js` | Warns about leftover `console.log` statements |
| `quality-gate.js` | Linting/formatting for JSON/MD/Go/Rust/Python files |
| `drift-detector.js` | Tracks suspicion score: git revert (+15%), 5+ dirs (+10%), test failures (+5%) |
| `fault-hint.js` | Suggests `/verify fault` when editing code with error handling or external calls |
| `observe.sh` | Continuous learning observation |

### Stop (7 hooks — session end)

| Hook | What It Does |
|------|-------------|
| `session-end.js` | Persists session state to `~/.claude/sessions/` |
| `check-console-log.js` | Scans all modified JS/TS files for leftover console.log |
| `evaluate-session.js` | Suggests pattern extraction if session > 10 user messages |
| `sprint-memory.js` | Updates sprint file with decisions, unfinished work, lessons |
| `memory-consolidate.js` | Daily: expired sprints → `long-term.md` |
| `memory-promote.js` | Daily: promotes cross-project instincts to system memory |
| `cost-tracker.js` | Records token usage and cost estimates to `~/.claude/metrics/` |

### Other Hooks

| Type | Hook | What It Does |
|------|------|-------------|
| PreCompact | `pre-compact.js` | Saves active session state before context compression |
| SessionStart | `session-start.js` | Loads recent sessions, detects project type, loads language rules |

---

## Commands (34 Total)

### Core Development Workflow

| Command | Purpose |
|---------|---------|
| `/plan` | Analyze requirements, assess risks, create phased implementation plan |
| `/tdd` | Enforce test-driven development: interface → failing test → minimal impl → refactor |
| `/code-review` | Security and quality review of uncommitted changes |
| `/build-fix` | Fix build/type/import errors one at a time with verification |
| `/verify` | Full verification: build → types → lint → tests → console.log audit → git status |
| `/quality-gate` | On-demand formatting, linting, and type-checking pipeline |

### Testing

| Command | Purpose |
|---------|---------|
| `/e2e` | Generate and run Playwright end-to-end tests with screenshots/video |
| `/test-coverage` | Analyze coverage gaps, generate missing tests to reach 80%+ |

### Design & UI/UX

| Command | Purpose |
|---------|---------|
| `/design-consultation` | Multi-perspective UI/UX consultation (UI Designer + UX Architect + UX Researcher) |
| `/design-review` | Post-implementation design review (tokens, accessibility, responsive, consistency) |

### Code Quality & Security

| Command | Purpose |
|---------|---------|
| `/grill` | Adversarial review: attack surface, edge cases, failure modes |
| `/refactor-clean` | Safe dead code removal with test verification per step |
| `/codex` | Cross-AI code review via OpenAI Codex CLI |

### Session & Memory Management

| Command | Purpose |
|---------|---------|
| `/save-session` | Save session state (decisions, blockers, what worked/didn't) |
| `/resume-session` | Load recent session and resume with full context |
| `/sessions` | List, load, alias, and inspect session history |
| `/memory-status` | View dual-track memory status (personal + project) |

### Autonomous Loops (6 commands)

| Command | Purpose |
|---------|---------|
| `/autoloop` | Goal-driven iteration: modify → verify → keep/rollback → repeat |
| `/autoloop:debug` | Autonomous bug hunting with 7 investigation techniques |
| `/autoloop:fix` | Generalized error fixing (build/lint/type/test — superset of `/build-fix`) |
| `/autoloop:predict` | Multi-persona prediction debate (3-5 experts → consensus) |
| `/autoloop:scenario` | 12-dimension scenario exploration (NULL, BOUNDARY, CONCURRENCY, etc.) |
| `/autoloop:security` | Autonomous security audit (STRIDE + OWASP, iterative remediation) |

### Safety & Flow Control

| Command | Purpose |
|---------|---------|
| `/careful` | Toggle destructive command guard |
| `/freeze` / `/unfreeze` | Lock/unlock edit scope to a directory |
| `/checkpoint` | Create, verify, or list workflow checkpoints |

### Learning & Knowledge

| Command | Purpose |
|---------|---------|
| `/learn` | Extract reusable patterns from session → save as skill |
| `/learn-eval` | `/learn` with quality gate + Global vs Project save location |
| `/eval` | Eval-driven development: define, check, and report capability evals |
| `/restore` | Restore archived components (skills/agents/commands) |

### Utility

| Command | Purpose |
|---------|---------|
| `/aside` | Quick side question without interrupting current task |
| `/update-docs` | Sync documentation from source code |
| `/harness-audit` | Audit hooks/skills/commands/agents configuration health |

---

## Agent Routing (26 Active Agents)

| Task | Agent |
|------|-------|
| React/Vue/CSS | `engineering-frontend-developer` |
| API/Database | `engineering-backend-architect` |
| Security audit | `engineering-security-engineer` |
| CI/CD/Docker | `engineering-devops-automator` |
| Code review | `engineering-code-reviewer` |
| Architecture | `engineering-software-architect` |
| AI/ML | `engineering-ai-engineer` |
| Full project | `agents-orchestrator` |
| Prototype | `engineering-rapid-prototyper` |
| API tests | `testing-api-tester` |

Agents auto-trigger based on task type. Design agents activate when UI/visual files are detected.

---

## Strategy & Playbooks

The `strategies/` directory contains NEXUS operational doctrine for multi-agent project execution:

| Document | Purpose |
|----------|---------|
| `QUICKSTART.md` | 5-min guide with 3 deployment modes (Full/Sprint/Micro) |
| `nexus-strategy.md` | Full operational doctrine: 7-phase process, 10-agent coordination matrix |
| `EXECUTIVE-BRIEF.md` | Executive summary with business impact and recommendations |

### 7-Phase Playbooks (`strategies/playbooks/`)

| Phase | Name | Duration | Agents |
|-------|------|----------|--------|
| 0 | Discovery | 3-7 days | 6 parallel (trends, feedback, UX, analytics, compliance, tools) |
| 1 | Strategy & Architecture | 5-10 days | 8 (producer, brand, finance, UX, backend, etc.) |
| 2 | Foundation & Scaffold | 3-5 days | 6 (DevOps, infrastructure, operations) |
| 3 | Build & Iterate | 2-12 weeks | 15-30+ (4 parallel tracks: product, growth, quality, brand) |
| 4 | Hardening | 3-7 days | 8 (Reality Checker defaults to "NEEDS WORK") |
| 5 | Launch & Growth | — | Marketing, sales, growth activation |
| 6 | Operate & Evolve | Ongoing | Long-term ops and continuous improvement |

### Scenario Runbooks (`strategies/runbooks/`)

| Scenario | Use Case |
|----------|----------|
| `scenario-startup-mvp.md` | 4-6 week MVP with full validation pipeline |
| `scenario-enterprise-feature.md` | Large feature with security/compliance requirements |
| `scenario-marketing-campaign.md` | Multi-channel campaign with brand review |
| `scenario-incident-response.md` | P0/P1 production incident (MTTR < 30min target) |

---

## File Structure

```
.
├── CLAUDE.md                          ← Project instructions for Claude
├── README.md                          ← This file
├── setup-claude.sh                    ← Setup script
└── .claude/
    ├── settings.json                  ← 21 hook configurations (5 types)
    ├── agents/                        ← 26 active agents
    ├── skills/                        ← 39 active skills
    ├── commands/                      ← 29 top-level + 5 autoloop subcommands
    ├── rules/
    │   └── common/                    ← 10 rule files (coding, security, testing, etc.)
    ├── rules-all/                     ← 8 language-specific rule sets
    ├── scripts/
    │   ├── hooks/                     ← 23 hook scripts
    │   └── install-level8.sh          ← One-click Level 8 setup
    ├── strategies/
    │   ├── playbooks/                 ← 7 phase playbooks (Phase 0-6)
    │   ├── runbooks/                  ← 4 scenario runbooks
    │   └── coordination/             ← Agent prompts & handoff templates
    ├── shared-state/                  ← Multi-agent coordination (runtime)
    ├── memory/                        ← Sprint files & architecture doc
    ├── mcp-configs/                   ← MCP server templates
    └── examples/                      ← 5 workflow examples
```

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

```bash
# Copy .claude/ directory to your project
cp -r .claude/ /path/to/your-project/.claude/

# Copy CLAUDE.md
cp CLAUDE.md /path/to/your-project/

# Install runtime files
cd /path/to/your-project
bash .claude/scripts/install-level8.sh
```

## Sources (all MIT)

| System | Source | What It Provides |
|--------|--------|-----------------|
| ECC | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) | Infrastructure: hooks, memory, commands |
| Superpowers | [obra/superpowers](https://github.com/obra/superpowers) | Process: TDD, debugging, quality gates |
| Agency Agents | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Expertise: 26 active agent personas |
| **Level 8** | **This repo** | **Autonomous agent coordination layer** |

## License

MIT
