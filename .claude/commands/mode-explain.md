Explain current task mode and recent mode change history.

Use when you (or the user) want to know "who changed the mode, when, and why" —
critical when 5 entry points can mutate mode (task-router / set-mode /
pre-tool-escalate / user-prompt-classify / idle-reset).

## Usage

- `/mode-explain` — show current mode + last 5 changes
- `/mode-explain -n 20` — show last N changes
- `/mode-explain --all` — full history

## Implementation

```bash
node ~/.claude/scripts/hooks/mode-explain.js $ARGUMENTS
```

## When to invoke

- After unexpected escalation (e.g. evaluation-gate blocks but you think task was Fast)
- Before `set-mode --reset` to verify the upgrade reason still applies
- When debugging hook gate behavior (which hooks are active depends on current mode)
- When multiple sessions report different mode states — diff their `/mode-explain` output

## Reads (no side effects)

- `.claude/.task-mode` (current mode)
- `.claude/logs/mode-trace.jsonl` (append-only audit log)
