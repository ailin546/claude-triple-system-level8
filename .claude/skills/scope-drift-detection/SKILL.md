---
description: Detect scope drift in PRs by comparing actual changes against stated intent
triggers:
  - before code review
  - before creating PR
  - when reviewing branch changes
---

# Scope Drift Detection

Inspired by gstack's review Step 1.5 — cross-references the diff against stated intent
to flag unrelated changes (scope creep) and missing expected changes.

## When to Use

- Before `/code-review` — run as a pre-check
- Before creating a PR — ensure all changes are intentional
- During review — verify no drift occurred during implementation

## Workflow

### Step 1: Extract Intended Scope

Read these sources to understand what changes were expected:

1. **TODOS.md** — check for task descriptions related to current branch
2. **PR description** — if PR exists, read via `gh pr view --json body`
3. **Commit messages** — `git log --oneline base..HEAD` to extract intent
4. **Branch name** — parse feature/fix/refactor pattern from branch name

Synthesize into a list of **expected change areas** (directories, modules, file types).

### Step 2: Get Actual Changes

```bash
# Detect base branch
BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "origin/main")

# List all changed files
git diff --name-only $BASE...HEAD
```

### Step 3: Classify Each Changed File

For every changed file, classify as one of:

| Category | Symbol | Meaning |
|----------|--------|---------|
| Expected | ✅ | File is directly related to stated intent |
| Related | ⚠️ | Plausibly related but outside primary scope (needs confirmation) |
| Drift | ❌ | Unrelated to stated intent (scope creep) |
| Missing | 📋 | Expected based on intent but not changed (possible oversight) |

### Step 4: Output Report

```
## Scope Drift Analysis

Branch: feature/add-oauth-login
Intent: Add OAuth login to user authentication system

### ✅ Expected (8 files)
- src/auth/oauth.ts
- src/auth/oauth.test.ts
- src/routes/auth.ts
- ...

### ⚠️ Needs Confirmation (2 files)
- src/middleware/cors.ts — CORS config changed, may be needed for OAuth redirect
- package.json — new dependency added

### ❌ Scope Drift (1 file)
- src/utils/string-helpers.ts — unrelated utility change, consider separate PR

### 📋 Possibly Missing (1 file)
- src/config/oauth-providers.ts — OAuth provider config not yet created

**Drift Score: 1/11 files (9%) — Low drift**
```

### Step 5: Recommendations

- **0% drift** → Proceed with review
- **1-15% drift** → Flag drifted files, ask user to confirm or split
- **>15% drift** → Strongly recommend splitting into separate PRs

## Integration

This skill is called automatically by:
- `requesting-code-review` skill — as a pre-check before code review
- `finishing-a-development-branch` skill — before PR creation

Can also be invoked manually during any review session.
