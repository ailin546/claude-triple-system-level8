#!/usr/bin/env node
/**
 * PreToolUse Bash hook: warn (don't block) on git commits whose message
 * advertises a fix but contains no root-cause language.
 *
 * Triggers on `git commit ... -m "..."` (single-line) and HEREDOC variants.
 * Heuristic:
 *   - Subject line contains "fix"/"hotfix"/"修"/"修复"/"bug"/"bugfix"/"patch"
 *   - AND body+subject lack any of: "root cause"/"根因"/"because"/"caused by"/
 *     "due to"/"because of"/"reason"/"why"/"原因"
 *   → Print warning to stderr (visible to Claude) suggesting commit message
 *     should explain the WHY of the fix, not just WHAT.
 *
 * Non-blocking by design (exit 0). The goal is to make symptom-fix commits
 * cognitively visible — Claude will see the warning and either:
 *   (a) realize the fix really is symptom-only and re-do as root-cause, or
 *   (b) update the commit message to include WHY.
 *
 * Bypassing this is trivial (add "because X" to the message), but the act
 * of writing those words forces Claude to articulate the root cause —
 * which is exactly the desired behavioral nudge.
 */

'use strict';

const fs = require('fs');

const FIX_INDICATORS = /\b(fix(?:es|ed|ing)?|hotfix|bugfix|patch)\b/i;
const FIX_INDICATORS_CN = /(修复|修一下|修了|hotfix|bug\s*fix)/i;
const ROOT_CAUSE_INDICATORS = /(root\s*cause|根因|because|caused\s+by|due\s+to|reason|why|原因|根本原因|fix\s+for|introduced\s+by|regressed\s+from)/i;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractCommitMessage(cmd) {
  // Match `git commit ... -m "..."` (with escaped quotes)
  const dashM = cmd.match(/git\s+commit\b[^]*?-m\s+(['"])([^]*?)\1/);
  if (dashM) return dashM[2];

  // Match HEREDOC pattern: -m "$(cat <<'EOF'\n...\nEOF\n)"
  const heredoc = cmd.match(/<<\s*'?EOF'?\s*\n([^]*?)\nEOF/);
  if (heredoc) return heredoc[1];

  return null;
}

function main() {
  let parsed = null;
  try {
    parsed = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const tool = parsed && parsed.tool_name;
  if (tool !== 'Bash') process.exit(0);

  const cmd = (parsed && parsed.tool_input && parsed.tool_input.command) || '';
  if (!cmd.includes('git commit')) process.exit(0);

  const msg = extractCommitMessage(cmd);
  if (!msg) process.exit(0);

  const fixHit = FIX_INDICATORS.test(msg) || FIX_INDICATORS_CN.test(msg);
  if (!fixHit) process.exit(0);

  const rcHit = ROOT_CAUSE_INDICATORS.test(msg);
  if (rcHit) process.exit(0); // commit explains WHY → fine

  // Warn but don't block.
  console.error(
    `[FixDepthCheck] WARNING: commit message advertises a fix but contains no root-cause explanation.\n` +
    `[FixDepthCheck] Symptom-only fixes are a regression toward "quick-and-working" mode (~/.claude/CLAUDE.md §编码行为准则 Rule 1).\n` +
    `[FixDepthCheck] Before this commit, ensure your message body answers:\n` +
    `[FixDepthCheck]   1. What was the root cause? (not just "what changed" — "why was the bug possible?")\n` +
    `[FixDepthCheck]   2. Will the same class of bug recur? If yes, this is symptom mode.\n` +
    `[FixDepthCheck]   3. Did you also add a guard/test/check that prevents recurrence?\n` +
    `[FixDepthCheck] If this IS intentionally symptom-only (rare hotfix), say so explicitly + reference root-cause TODO.\n` +
    `[FixDepthCheck] To dismiss: add words like "root cause:" / "because" / "due to" / "原因" / "根因" to the commit body.\n`
  );

  process.exit(0); // soft warn, not block
}

// Export internals for unit tests (per M4 hook test 标杆 protocol).
module.exports = {
  FIX_INDICATORS,
  FIX_INDICATORS_CN,
  ROOT_CAUSE_INDICATORS,
  extractCommitMessage,
};

// Only run as hook when invoked directly (not when require()-d by tests)
if (require.main === module) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
