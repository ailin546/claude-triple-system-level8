# Agent Drift Detection

## How It Works

A PostToolUse hook (`drift-detector.js`) maintains a suspicion score per session:

| Event | Score Change |
|-------|-------------|
| `git revert` / `git checkout --` / `git restore` | +15% |
| Editing files across 5+ different directories | +10% |
| Same file edited 3+ times | +5% |
| 3+ consecutive test failures | +5% |
| Test transitions from fail to pass | -5% |

## Thresholds

- **20%**: Warning message — "Consider pausing to verify direction"
- **40%**: Critical warning — "STOP and run /verify before continuing"

## When It Triggers

Active on all PostToolUse events for Edit, Write, and Bash tools.
Especially valuable during:
- `dispatching-parallel-agents` workflows
- `subagent-driven-development` sessions
- `ecc-autonomous-loops` scenarios

## State

Stored in `.claude/.drift-state/{session-id}.json`. Resets per session.
