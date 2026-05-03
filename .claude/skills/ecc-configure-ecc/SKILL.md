---
name: ecc-configure-ecc
description: Use when installing, uninstalling, or upgrading Everything Claude Code (ECC) components, or when verifying ECC installation paths and configuration.
---

# Configure Everything Claude Code (ECC)

An interactive, step-by-step installation wizard for the Everything Claude Code project. Uses `AskUserQuestion` to guide users through selective installation of skills and rules, then verifies correctness and offers optimization.

## When to Use

- User says "configure ecc", "install ecc", "setup everything claude code", or similar
- User wants to selectively install skills or rules from this project
- User wants to verify or fix an existing ECC installation
- User wants to optimize installed skills or rules for their project

## When NOT to Use

- User only wants to read about ECC without making changes
- User is asking about a specific skill's behavior (use that skill's own SKILL.md)

## Prerequisites

This skill must be accessible to Claude Code before activation. Two ways to bootstrap:
1. **Via Plugin**: `/plugin install everything-claude-code` — the plugin loads this skill automatically
2. **Manual**: Copy only this skill to `~/.claude/skills/configure-ecc/SKILL.md`, then activate by saying "configure ecc"

## Topics

| Topic | File | Contents |
|-------|------|----------|
| Installation (Steps 0-3) | [installation.md](installation.md) | Clone repo, choose install level, select and install skills and rules |
| Skill Catalog | [skill-catalog.md](skill-catalog.md) | Full list of 41 skills across 8 categories (used during Step 2c) |
| Verification (Step 4) | [verification.md](verification.md) | Post-install checks, cross-reference validation, troubleshooting |
| Optimization & Summary (Steps 5-6) | [optimization-and-summary.md](optimization-and-summary.md) | Optimize installed files, cleanup, final summary report |

**Execution flow**: Read installation.md first, then skill-catalog.md when needed for Step 2c, then verification.md, then optionally optimization-and-summary.md.
