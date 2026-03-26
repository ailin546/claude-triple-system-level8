---
name: shared-state-sync
description: "Multi-agent shared state coordination — read/write board.json, append decisions.log, manage artifacts for cross-agent communication."
origin: custom
---

# Shared State Sync Skill

Real-time coordination layer for multi-agent workflows. Ensures every agent reads the same global state and writes back atomically.

## When to Use

- Before starting any agent task in a multi-agent workflow
- After completing a task to update global state
- When checking for conflicts before modifying shared files
- When an orchestrator needs to dispatch and track parallel agents
- Anytime an agent produces output that another agent needs

## Shared State Directory

```
.claude/shared-state/
├── board.json       ← Global task board (read/write)
├── decisions.log    ← Append-only audit trail
├── README.md        ← Schema documentation
└── artifacts/       ← Agent output artifacts
    └── {task-id}/   ← Namespaced per task
```

## Agent Lifecycle Protocol

### 1. On Agent Start — Read State

```
READ .claude/shared-state/board.json
├── Check "tasks" array for your assigned task
├── Check "agents" array for running peers
├── Check "conflicts" array for file overlap warnings
└── Read any artifacts from dependency tasks
```

**Register yourself:**
```json
{
  "id": "{agent-type}-{short-uuid}",
  "type": "planner",
  "status": "running",
  "currentTask": "task-001",
  "startedAt": "2026-03-17T10:00:00Z",
  "completedAt": null
}
```

### 2. During Work — Log Decisions

Append to `decisions.log` for significant actions:

```
[2026-03-17T10:05:00Z] [planner-001] [DECIDE] Chose Repository Pattern for data access — isolates storage from business logic
[2026-03-17T10:10:00Z] [planner-001] [FLAG] Potential conflict: auth.ts also being modified by tdd-guide-002
```

**Action types:**
| Action | When |
|--------|------|
| `START` | Beginning a task |
| `DECIDE` | Making an architectural or design decision |
| `COMPLETE` | Finishing a task |
| `FLAG` | Detected a conflict or issue |
| `BLOCKED` | Cannot proceed, needs resolution |
| `HANDOFF` | Passing work to next agent |

### 3. On Agent Complete — Write Back

Update board.json atomically:
1. Set your task status to `completed`
2. Set your agent status to `completed` with `completedAt`
3. Write output artifacts to `artifacts/{task-id}/`
4. Update any downstream task dependencies
5. Add conflict entries if you modified files others might touch

### 4. Conflict Detection

Before modifying a file, check:
```
1. Read board.json → agents array
2. For each running agent, check their currentTask
3. For each task, check if file paths overlap with yours
4. If overlap found → add to conflicts array, log to decisions.log
5. Resolution: either wait, coordinate, or flag for human
```

## Orchestrator Pattern

The orchestrator agent manages the board:

```
ORCHESTRATOR WORKFLOW:
1. Parse user request into tasks with dependencies
2. Write tasks to board.json
3. Dispatch agents for tasks with no unmet dependencies
4. Monitor: poll board.json for completed tasks
5. When task completes → check if dependent tasks are unblocked
6. Dispatch newly unblocked tasks
7. When all tasks complete → generate final report
8. Clean up: archive board state to artifacts/
```

### Task Dependency Resolution

```
Tasks: A(no deps), B(no deps), C(depends: A), D(depends: A,B), E(depends: C,D)

Execution waves:
  Wave 1: [A, B]     ← parallel, no deps
  Wave 2: [C]        ← A done, dispatch C
  Wave 3: [D]        ← A+B done, dispatch D (C may still be running)
  Wave 4: [E]        ← C+D done, dispatch E
```

## Artifact Convention

```
artifacts/
├── task-001/
│   ├── plan.md           ← Planner output
│   └── file-list.json    ← Files to be modified
├── task-002/
│   ├── test-results.json ← TDD guide output
│   └── coverage.txt      ← Coverage report
└── task-003/
    └── review.md         ← Code reviewer output
```

Artifacts are the **handoff mechanism** between agents. Each agent reads its dependency artifacts and writes its own.

## Integration with Existing Systems

| System | Integration |
|--------|-------------|
| `/save-session` | Includes board.json snapshot in session file |
| `/resume-session` | Restores board.json state from session |
| `session-end.js` hook | Auto-archives board state on session end |
| `dispatching-parallel-agents` | Agents register in board.json before work |

## Example: Feature Workflow

```
User: "Add OAuth login"

Orchestrator writes board.json:
  task-001: Research OAuth patterns (planner)
  task-002: Write auth tests (tdd-guide, depends: 001)
  task-003: Implement OAuth (backend-architect, depends: 001)
  task-004: Security review (security-reviewer, depends: 002, 003)

Wave 1: planner starts task-001
  → writes artifacts/task-001/plan.md
  → logs [DECIDE] PKCE flow, [COMPLETE]

Wave 2: tdd-guide + backend-architect start in parallel
  → tdd-guide reads plan.md, writes tests
  → backend-architect reads plan.md, implements
  → both check conflicts (same files?) → log if overlap

Wave 3: security-reviewer reads all artifacts
  → reviews, writes artifacts/task-004/review.md
  → logs [COMPLETE] or [FLAG] issues found

Board shows: all tasks completed, 0 conflicts
→ Orchestrator generates final report
```
