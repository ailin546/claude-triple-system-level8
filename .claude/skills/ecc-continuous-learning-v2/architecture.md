# Architecture & Data Flow

## How It Works

Hooks capture every tool call (PreToolUse/PostToolUse) and detect project context via git remote URL or repo path. Observations are stored in project-scoped JSONL files, then a background Haiku agent performs pattern detection and creates or updates instinct YAML files.

The pipeline:
1. Hooks write to `projects/<hash>/observations.jsonl`
2. Background observer agent reads observations and detects patterns (user corrections, error resolutions, repeated workflows)
3. Observer decides scope: project or global?
4. Instincts created/updated in `projects/<hash>/instincts/personal/` or `instincts/personal/` (global)
5. `/evolve` clusters instincts into full skills/commands/agents

## Why Hooks vs Skills for Observation?

Skills are probabilistic - they fire ~50-80% of the time based on Claude's judgment. Hooks fire **100% of the time**, deterministically:
- Every tool call is observed
- No patterns are missed
- Learning is comprehensive

## Pattern Detection

The observer agent extracts instincts from:
- **User corrections** - when the user changes Claude's approach
- **Error resolutions** - what fixed recurring errors
- **Repeated workflows** - sequences Claude uses in this project

## File Structure

```
~/.claude/homunculus/
  identity.json           # Your profile, technical level
  projects.json           # Registry: project hash -> name/path/remote
  observations.jsonl      # Global observations (fallback)
  instincts/
    personal/             # Global auto-learned instincts
    inherited/            # Global imported instincts
  evolved/
    agents/               # Global generated agents
    skills/               # Global generated skills
    commands/             # Global generated commands
  projects/
    a1b2c3d4e5f6/         # Project hash (from git remote URL)
      project.json        # Per-project metadata
      observations.jsonl
      observations.archive/
      instincts/
        personal/         # Project-specific auto-learned
        inherited/        # Project-specific imported
      evolved/
        skills/
        commands/
        agents/
    f6e5d4c3b2a1/
      ...
```
