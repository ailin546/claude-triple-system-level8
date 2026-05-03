# Project Isolation

## v2.0 vs v2.1 Comparison

| Feature | v2.0 | v2.1 |
|---------|------|------|
| Storage | Global (~/.claude/homunculus/) | Project-scoped (projects/<hash>/) |
| Scope | All instincts apply everywhere | Project-scoped + global |
| Detection | None | git remote URL / repo path |
| Promotion | N/A | Project -> global when seen in 2+ projects |
| Commands | 4 (status/evolve/export/import) | 6 (+promote/projects) |
| Cross-project | Contamination risk | Isolated by default |

## Project Detection Algorithm

The system automatically detects the current project (priority order):

1. `CLAUDE_PROJECT_DIR` env var (highest priority)
2. `git remote get-url origin` - hashed to create a portable project ID (same repo on different machines = same ID)
3. `git rev-parse --show-toplevel` - fallback using repo path (machine-specific)
4. Global fallback - if no project detected, instincts go to global scope

Each project gets a 12-character hash ID (e.g., `a1b2c3d4e5f6`). A registry at `~/.claude/homunculus/projects.json` maps IDs to human-readable names.

## Backward Compatibility

v2.1 is fully compatible with v2.0 and v1:
- Existing global instincts in `~/.claude/homunculus/instincts/` still work as global instincts
- Existing `~/.claude/skills/learned/` skills from v1 still work
- Stop hook still runs (but now also feeds into v2)
- Gradual migration: run both in parallel

## Privacy

- Observations stay local on your machine
- Project-scoped instincts are isolated per project
- Only instincts (patterns) can be exported, not raw observations
- No actual code or conversation content is shared
- You control what gets exported and promoted

## Related Resources

- Skill Creator (https://skill-creator.app) - Generate instincts from repo history
- Homunculus - Community project that inspired the v2 instinct-based architecture
- The Longform Guide - Continuous learning section
