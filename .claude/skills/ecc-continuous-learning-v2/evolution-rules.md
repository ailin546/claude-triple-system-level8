# Evolution & Promotion Rules

## v2 vs v1 Comparison

| Feature | v1 | v2 |
|---------|----|----|
| Observation | Stop hook (session end) | PreToolUse/PostToolUse (100% reliable) |
| Analysis | Main context | Background agent (Haiku) |
| Granularity | Full skills | Atomic "instincts" |
| Confidence | None | 0.3-0.9 weighted |
| Evolution | Direct to skill | Instincts -> cluster -> skill/command/agent |
| Sharing | None | Export/import instincts |

## Evolving Instincts into Skills/Agents

The `/evolve` command clusters related instincts and generates full artifacts. Output lands in:
- `projects/<hash>/evolved/` (project-scoped): `skills/`, `commands/`, `agents/`
- `evolved/` (global): `skills/`, `commands/`, `agents/`

The `/evolve` command also surfaces promotion candidates.

## Instinct Promotion (Project -> Global)

When the same instinct appears in multiple projects with high confidence, it qualifies for global promotion.

**Auto-promotion criteria:**
- Same instinct ID in 2+ projects
- Average confidence >= 0.8

**How to promote:**

```bash
# Promote a specific instinct
python3 instinct-cli.py promote prefer-explicit-errors

# Auto-promote all qualifying instincts
python3 instinct-cli.py promote

# Preview without changes
python3 instinct-cli.py promote --dry-run
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `/instinct-status` | Show all instincts (project-scoped + global) with confidence |
| `/evolve` | Cluster related instincts into skills/commands, suggest promotions |
| `/instinct-export` | Export instincts (filterable by scope/domain) |
| `/instinct-import <file>` | Import instincts with scope control |
| `/promote [id]` | Promote project instincts to global scope |
| `/projects` | List all known projects and their instinct counts |
