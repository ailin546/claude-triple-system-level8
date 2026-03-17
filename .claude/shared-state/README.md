# Shared State Directory

Multi-agent real-time coordination layer.

## Files

| File | Purpose | Access Pattern |
|------|---------|----------------|
| `board.json` | Global task board — tasks, agent status, conflicts | Read on start, write on finish |
| `decisions.log` | Append-only decision audit trail | Append only, never mutate |
| `artifacts/` | Agent output artifacts referenced by other agents | Write by producer, read by consumer |

## board.json Schema

```json
{
  "version": "1.0.0",
  "lastUpdated": "ISO-8601 timestamp",
  "activeWorkflow": "workflow-id or null",
  "tasks": [
    {
      "id": "task-001",
      "description": "What needs to be done",
      "status": "pending | in_progress | completed | blocked",
      "assignedAgent": "agent-type or null",
      "dependencies": ["task-id"],
      "output": "path to artifact or inline result",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "agents": [
    {
      "id": "agent-instance-id",
      "type": "planner | tdd-guide | code-reviewer | ...",
      "status": "running | completed | failed",
      "currentTask": "task-id",
      "startedAt": "ISO-8601",
      "completedAt": "ISO-8601 or null"
    }
  ],
  "conflicts": [
    {
      "taskA": "task-id",
      "taskB": "task-id",
      "type": "file_overlap | dependency_cycle | merge_conflict",
      "description": "What conflicted",
      "resolution": "pending | resolved",
      "resolvedBy": "agent-id or null"
    }
  ]
}
```

## decisions.log Format

```
[2026-03-17T10:00:00Z] [planner-001] [DECIDE] Use JWT over session cookies — reason: stateless, scales horizontally
[2026-03-17T10:05:00Z] [tdd-guide-001] [START] Writing tests for auth module
[2026-03-17T10:30:00Z] [tdd-guide-001] [COMPLETE] 12 tests written, all passing
[2026-03-17T10:31:00Z] [code-reviewer-001] [FLAG] auth.ts line 42: missing rate limit check
```

## Concurrency Rules

1. Read board.json before starting work
2. Update your agent entry and task status atomically
3. Append to decisions.log (never edit existing lines)
4. Check conflicts array before modifying shared files
5. Write artifacts to `artifacts/{task-id}/` namespace
