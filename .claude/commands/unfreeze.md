Remove the edit scope restriction set by /freeze.

## Usage

`/unfreeze`

## Implementation

```bash
FREEZE_FILE="${CLAUDE_PROJECT_ROOT}/.claude/.freeze-dir"
if [ -f "$FREEZE_FILE" ]; then
  FROZEN_DIR="$(cat "$FREEZE_FILE")"
  rm -f "$FREEZE_FILE"
  echo "Edit scope unlocked. Was restricted to: $FROZEN_DIR"
  echo "All files can now be edited."
else
  echo "No freeze active. All files can already be edited."
fi
```
