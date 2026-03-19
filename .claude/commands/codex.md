Cross-AI code review using OpenAI Codex CLI. Provides independent review from a different
AI model to catch blind spots.

## Usage

- `/codex review` — Standard code review against base branch
- `/codex challenge` — Adversarial analysis (find production failure modes)
- `/codex consult <question>` — Ask Codex for advice (supports session continuity)

## Prerequisites

```bash
npm install -g @openai/codex
codex login  # OAuth, free tier
```

## Gate Mechanism

- `[P1]` findings → FAIL (must fix before merge)
- `[P2]` findings → PASS (informational)

## Implementation

Read and execute the skill defined in `.claude/skills/codex-review/SKILL.md`.

First check if codex is installed:
```bash
if ! command -v codex &> /dev/null; then
  echo "Codex CLI not installed. Run: npm install -g @openai/codex && codex login"
  exit 0
fi
```

Then execute the appropriate mode based on the first argument.
