---
description: Cross-AI code review using OpenAI Codex CLI (OAuth, no API key needed)
triggers:
  - before merging critical PRs
  - after code review for second opinion
  - on demand for adversarial analysis
---

# Codex Cross-AI Review

Use OpenAI's Codex CLI as an independent "second pair of eyes" to review code,
eliminating Claude's self-review blind spots.

Inspired by gstack's /codex mechanism.

## Prerequisites

```bash
# Install Codex CLI
npm install -g @openai/codex

# Login with OAuth (free tier, no API key needed)
codex login
```

## Three Modes

### 1. Standard Review (`/codex review`)

Standard code review against the base branch:

```bash
# Detect base branch
BASE=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo "main")

# Run Codex review
codex review --base "origin/$BASE" \
  -c 'model_reasoning_effort="high"' \
  --enable web_search_cached
```

**Gate verdict:**
- Output contains `[P1]` markers → **FAIL** (critical findings, must fix)
- Only `[P2]` or no findings → **PASS**

### 2. Adversarial Challenge (`/codex challenge`)

Stress-test code for production failure modes:

```bash
codex exec "Your job is to find ways this code will fail in production. \
Think like an attacker and chaos engineer. Examine the diff against $BASE. \
Find edge cases, race conditions, security holes, resource leaks, \
failure modes, and silent data corruption paths. \
Mark critical findings as [P1] and informational as [P2]." \
  -s read-only \
  -c 'model_reasoning_effort="xhigh"' \
  --enable web_search_cached \
  --json
```

Parse JSONL output for reasoning traces:
- `[codex thinking]` — intermediate reasoning
- `[codex ran]` — tool invocations
- Present full output verbatim (no summarization)

### 3. Consult Mode (`/codex consult <question>`)

Ask Codex for advice with session continuity:

```bash
# First call
codex exec "<question>" -s read-only \
  -c 'model_reasoning_effort="high"' \
  --enable web_search_cached \
  --json

# Save session ID from output
echo "$SESSION_ID" > .context/codex-session-id

# Subsequent calls resume session
codex exec resume "$(cat .context/codex-session-id)"
```

## Output Format

```
## Codex Review Results

Mode: review | challenge | consult
Gate: PASS | FAIL (N critical findings)
Tokens: 14,331 | Est. cost: ~$0.12

### Findings
[P1] SQL injection in user input handler (src/routes/users.ts:42)
[P2] Missing error boundary in React component (src/App.tsx:15)

### Reasoning Trace (challenge mode only)
[codex thinking] Checking for race conditions in the payment flow...
[codex ran] grep -r "async.*payment" src/
[codex thinking] Found potential double-charge scenario...
```

## Integration

- **After `/code-review`**: Optional second opinion step
- **Before `/ship`**: challenge mode as final gate for critical releases
- **Results logged**: Written to review log for `/learn` to extract patterns

## Important Notes

- Codex runs in **read-only sandbox** — it cannot modify your code
- Free tier has rate limits; use judiciously on critical reviews
- If Codex CLI is not installed, skip gracefully with a note
