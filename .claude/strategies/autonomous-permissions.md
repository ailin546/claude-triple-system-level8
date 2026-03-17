# Autonomous Permissions Strategy

## Goal: 90% of operations run without human confirmation

Configure `allowedTools` to auto-approve safe operations while keeping
destructive actions gated behind human confirmation.

## Permission Tiers

### Tier 1: Always Auto-Approve (Safe, Read-Only or Reversible)

Add these to `~/.claude/settings.json` → `allowedTools`:

```json
{
  "allowedTools": [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "TodoWrite",
    "Agent",
    "Bash(npm test*)",
    "Bash(npm run lint*)",
    "Bash(npm run build*)",
    "Bash(npm run typecheck*)",
    "Bash(npx tsc*)",
    "Bash(npx eslint*)",
    "Bash(npx prettier*)",
    "Bash(node *)",
    "Bash(cat *)",
    "Bash(ls *)",
    "Bash(git status*)",
    "Bash(git diff*)",
    "Bash(git log*)",
    "Bash(git branch*)",
    "Bash(git stash*)",
    "Bash(gh pr *)",
    "Bash(gh issue *)",
    "Bash(gh run *)",
    "Bash(mkdir *)",
    "Edit",
    "Write",
    "NotebookEdit"
  ]
}
```

### Tier 2: Auto-Approve with Caution (Reversible but Impactful)

```json
{
  "allowedTools": [
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git checkout -b *)",
    "Bash(git merge *)",
    "Bash(npm install *)",
    "Bash(pip install *)"
  ]
}
```

### Tier 3: ALWAYS Require Human Confirmation

NEVER add these to allowedTools:
- `Bash(git push*)` — pushes to remote
- `Bash(git reset --hard*)` — destroys history
- `Bash(git push --force*)` — rewrites remote
- `Bash(rm -rf*)` — destructive delete
- `Bash(npm publish*)` — publishes package
- `Bash(docker push*)` — publishes image
- `Bash(curl -X POST*)` — external API calls
- `Bash(ssh*)` — remote access
- Any deployment commands

## Recommended Configuration

### For Development (Most Autonomous)

```json
{
  "allowedTools": [
    "Read", "Glob", "Grep", "WebSearch", "WebFetch",
    "TodoWrite", "Agent", "Edit", "Write", "NotebookEdit",
    "Bash(npm test*)", "Bash(npm run *)", "Bash(npx *)",
    "Bash(node *)", "Bash(git status*)", "Bash(git diff*)",
    "Bash(git log*)", "Bash(git branch*)", "Bash(git stash*)",
    "Bash(git add *)", "Bash(git commit *)", "Bash(git checkout *)",
    "Bash(gh *)", "Bash(mkdir *)", "Bash(ls *)", "Bash(cat *)",
    "Bash(python *)", "Bash(pip install *)", "Bash(go *)",
    "Bash(cargo *)", "Bash(rustc *)"
  ]
}
```

### For CI/Automated Loops (Maximum Autonomy)

```json
{
  "allowedTools": [
    "Read", "Glob", "Grep", "WebSearch", "WebFetch",
    "TodoWrite", "Agent", "Edit", "Write", "NotebookEdit",
    "Bash(npm *)", "Bash(npx *)", "Bash(node *)",
    "Bash(git *)", "Bash(gh *)",
    "Bash(mkdir *)", "Bash(ls *)", "Bash(cat *)",
    "Bash(python *)", "Bash(pip *)", "Bash(go *)",
    "Bash(cargo *)"
  ]
}
```

**Note:** Even in CI mode, `git push --force` and `rm -rf /` are
blocked by Claude's built-in safety rules.

### For Review Only (Read-Only)

```json
{
  "allowedTools": [
    "Read", "Glob", "Grep", "WebSearch", "WebFetch",
    "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)",
    "Bash(npm test*)", "Bash(npm run lint*)"
  ]
}
```

## How to Apply

### Option A: Global settings (all projects)

Edit `~/.claude/settings.json`:
```json
{
  "allowedTools": [ ... ]
}
```

### Option B: Project settings (this project only)

Edit `.claude/settings.local.json`:
```json
{
  "allowedTools": [ ... ]
}
```

### Option C: Per-command (autonomous loops)

```bash
claude -p "..." --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git *)"
```

## Integration with Shared State

When running multi-agent workflows via `shared-state-sync`:
1. Orchestrator agent runs with Tier 1+2 permissions
2. Worker agents run with Tier 1 only (read + edit, no git)
3. Only orchestrator commits and pushes (Tier 3 still requires human)

This ensures workers can't accidentally push conflicting changes
while the orchestrator manages the merge queue.
