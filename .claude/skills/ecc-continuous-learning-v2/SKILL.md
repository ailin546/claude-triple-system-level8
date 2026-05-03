---
name: ecc-continuous-learning-v2
description: Use when wanting to extract reusable patterns and instincts from observed sessions, then evolve them into skills/commands/agents with project-scoped isolation.
---

# Continuous Learning v2.1 - Instinct-Based Architecture

Turns Claude Code sessions into reusable knowledge via atomic "instincts" small learned behaviors with confidence scoring. **v2.1** adds project-scoped instincts so React patterns stay in your React project, and universal patterns (like "always validate input") are shared globally.

## When to Activate

- Setting up automatic learning from Claude Code sessions
- Configuring instinct-based behavior extraction via hooks
- Tuning confidence thresholds for learned behaviors
- Reviewing, exporting, or importing instinct libraries
- Evolving instincts into full skills, commands, or agents
- Managing project-scoped vs global instincts
- Promoting instincts from project to global scope

## Quick Commands

| Command | Description |
|---------|-------------|
| `/instinct-status` | Show all instincts (project + global) with confidence |
| `/evolve` | Cluster instincts into skills/commands |
| `/instinct-export` | Export instincts (filterable by scope/domain) |
| `/instinct-import <file>` | Import instincts with scope control |
| `/promote [id]` | Promote project instincts to global scope |
| `/projects` | List all known projects and instinct counts |

## Topics

- [Architecture & Data Flow](architecture.md) - How hooks capture observations, pattern detection pipeline, file structure
- [Instinct Format](instinct-format.md) - YAML schema, properties, confidence scoring, scope decision guide
- [Evolution & Promotion Rules](evolution-rules.md) - Evolving instincts into skills/agents, promotion criteria, v2 vs v1 comparison
- [Setup & Configuration](setup-configuration.md) - Hook installation (plugin vs manual), directory init, config.json reference
- [Project Isolation](project-isolation.md) - v2.0 vs v2.1 diff, project detection algorithm, backward compatibility, privacy
