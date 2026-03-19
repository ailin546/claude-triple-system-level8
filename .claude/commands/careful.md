Toggle the destructive command guard on or off.

When enabled (default), dangerous commands like `rm -rf`, `DROP TABLE`, `git push --force`,
`git reset --hard`, etc. are automatically blocked by a PreToolUse hook.

## Usage

- `/careful` — Show current status
- `/careful on` — Enable guard (default)
- `/careful off` — Temporarily disable guard

## How it works

The guard runs as a PreToolUse:Bash hook that pattern-matches commands against a list of
known destructive operations. When a match is found, the command is blocked with an
explanation.

## Blocked patterns

- `rm -rf` / recursive force delete
- `DROP TABLE/DATABASE/SCHEMA`
- `TRUNCATE TABLE`
- `DELETE FROM` without WHERE
- `git push --force` (suggests --force-with-lease)
- `git reset --hard`
- `git clean -f`
- `git branch -D`
- `chmod 777`
- Writing to raw devices (`/dev/sd*`)
- Fork bombs
- `mkfs` / `dd` to devices

## Implementation

Check current state and toggle:

```bash
STATE_FILE="${CLAUDE_PROJECT_ROOT}/.claude/.careful-enabled"

if [ "$ARGUMENTS" = "off" ]; then
  echo "off" > "$STATE_FILE"
  echo "Careful guard DISABLED. Destructive commands will not be blocked."
  echo "Run /careful on to re-enable."
elif [ "$ARGUMENTS" = "on" ]; then
  echo "on" > "$STATE_FILE"
  echo "Careful guard ENABLED. Destructive commands will be blocked."
else
  if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "off" ]; then
    echo "Careful guard is currently DISABLED."
  else
    echo "Careful guard is currently ENABLED."
  fi
  echo ""
  echo "Usage: /careful on | /careful off"
fi
```
