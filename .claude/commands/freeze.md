Lock file edits to a specific directory. Any Edit or Write operation targeting a file
outside the allowed path will be blocked by a PreToolUse hook.

## Usage

`/freeze <directory>`

Example: `/freeze src/auth` — only files under `src/auth/` can be edited.

## How it works

1. Resolves the given directory to an absolute path
2. Saves it to `.claude/.freeze-dir`
3. The `freeze-guard.js` PreToolUse hook checks every Edit/Write operation
4. Files outside the frozen directory are blocked

## Important

This prevents accidental edits, not a security boundary — Bash commands like `sed`
can still modify files outside the boundary. Read, Glob, and Grep are unaffected.

## Implementation

Set the freeze directory:

```bash
TARGET="${ARGUMENTS}"
if [ -z "$TARGET" ]; then
  echo "Usage: /freeze <directory>"
  echo "Example: /freeze src/auth"
  exit 0
fi

ABS_PATH="$(cd "${CLAUDE_PROJECT_ROOT}" && realpath -m "$TARGET")"
echo "$ABS_PATH/" > "${CLAUDE_PROJECT_ROOT}/.claude/.freeze-dir"
echo "Edit scope locked to: $ABS_PATH/"
echo "Only files under this directory can be edited."
echo "Run /unfreeze to remove the restriction."
```
