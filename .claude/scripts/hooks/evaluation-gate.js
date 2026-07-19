#!/usr/bin/env node
/**
 * evaluation-gate.js — PreToolUse hook
 *
 * Hard-blocks `git commit` / `git push` when the current session is in
 * Heavy mode but the evaluation-loop skill has not recently produced a
 * passing verdict.
 *
 * Rationale (2026-04-19 元反思):
 *   - Rule layer (~/.claude/CLAUDE.md §任务模式路由 + workflow.md
 *     §Feature Implementation Workflow + commands/verify.md) already says
 *     Heavy tasks should route through evaluation-loop before ship.
 *   - But rule-layer is Claude self-discipline, and Claude skips it.
 *   - Today's 4-batch Heavy session went live with zero Reality Checker
 *     calls and full self-certification.
 *   - This hook enforces at the commit boundary.
 *
 * Signal source:
 *   State file `~/.claude/state/evaluation-gate/last-pass.json`.
 *   The evaluation-loop skill writes this file when Step 4 (Reality
 *   Checker) returns verdict == ACCEPTED. See skill SKILL.md.
 *
 * Gate logic:
 *   1. Only inspects Bash tool with `git commit` or `git push` cmd.
 *   2. Reads `.claude/.task-mode` (project-local); if not heavy → pass.
 *   3. Reads `last-pass.json`; validates schema; if stale or invalid → block.
 *   4. Block = exit 2 with stderr message telling Claude to run
 *      `/evaluation-loop` or `/verify pre-pr`.
 *
 * Anti-forgery (2026-04-19 Reality Checker audit fix):
 *   - marker must include `git_head` (short hash) matching current HEAD.
 *     If any code changes after the marker was written, `git_head` diverges
 *     and the marker is rejected — forces re-evaluation after edits.
 *   - marker must include non-empty `evaluator_agent_id` and
 *     `verdict_summary`. Missing or placeholder values (length < 10)
 *     are treated as forged.
 *
 * Non-blocking on error: any internal failure passes through. The gate
 * must never strand the user because of hook bugs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { splitSegments, gitSubcommand } = require('../lib/command-scan');

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.claude', 'state', 'evaluation-gate');
const LAST_PASS_FILE = path.join(STATE_DIR, 'last-pass.json');
const STALE_HOURS = 2;
const MIN_SUMMARY_LEN = 10;

function currentGitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readStdinJSON() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getProjectRoot(payload) {
  return (
    payload.cwd ||
    payload.workspace ||
    process.env.CLAUDE_PROJECT_ROOT ||
    process.cwd()
  );
}

function readTaskMode(projectRoot) {
  try {
    const p = path.join(projectRoot, '.claude', '.task-mode');
    return fs.readFileSync(p, 'utf8').trim().toLowerCase();
  } catch {
    return 'fast';
  }
}

/**
 * True iff the command actually runs `git commit` or `git push` at a command
 * HEAD — not merely mentions it inside a quoted string or flag value.
 *
 * Bug history (2026-05-20): the previous regex `(^|[\s;&|])git\s+(commit|push)`
 * matched the substring anywhere, so a commit message or a `set-mode --reason
 * "...git push..."` text was read as a real push. In Heavy mode that BLOCKED
 * the de-escalation command itself — a core part of the escalation deadlock.
 *
 * The fix strips quoted strings and splits into segments, then checks the git
 * subcommand at each segment's head (see ../lib/command-scan.js). Quoted
 * `--reason`/`-m` values can no longer trip the gate; `cd x && git push` and
 * plain `git commit` still do.
 */
function isCommitOrPush(cmd) {
  if (typeof cmd !== 'string') return false;
  return splitSegments(cmd).some((seg) => {
    const sub = gitSubcommand(seg);
    return sub === 'commit' || sub === 'push';
  });
}

/**
 * Strict path containment check using `path.relative`.
 *
 * Returns true iff `cdTarget` is a path strictly INSIDE `projectRoot`
 * (i.e. a descendant directory). Same-path returns false; the caller
 * combines with an explicit equality check when "same-or-inside" is
 * desired (see isCrossRepoPush below).
 *
 * Bug history (2026-05-06): the previous implementation used
 *   resolved.startsWith(projectRoot)
 * which is a string-prefix check — `/Users/hi/quant-deploy-s2`
 * literally starts with `/Users/hi/quant-deploy`, so a sibling worktree
 * was treated as inside the main repo. Result: the main worktree's
 * evaluation-loop marker was applied to s2 commits, blocking them.
 *
 * The fix uses `path.relative(root, target)`:
 *   - rel === ''               → same path
 *   - rel.startsWith('..')     → target is outside root
 *   - path.isAbsolute(rel)     → different drive (Windows) — treat outside
 *   - else                     → strictly inside
 *
 * @param {string} cdTarget    absolute or relative path
 * @param {string} projectRoot absolute path
 * @returns {boolean} true iff cdTarget is strictly inside projectRoot
 */
function isInsideProjectRoot(cdTarget, projectRoot) {
  const resolvedTarget = path.resolve(cdTarget);
  const resolvedRoot = path.resolve(projectRoot);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Heuristically detect a cross-repo push.
 *
 * Returns true when the command contains a `cd` that takes cwd OUTSIDE
 * projectRoot before running git — at which point the projectRoot's
 * evaluation-loop marker does not apply and the gate should pass through.
 *
 * Rationale (2026-05-03):
 *   `pre-tool-escalate` auto-escalates any `git push` to heavy. If the
 *   actual push targets a different repo (e.g. `cd /tmp/x && git push`),
 *   this gate would block it using the wrong repo's marker. The heuristic
 *   below handles the common scripted forms:
 *     - `cd /abs/path && git push`           — literal absolute path
 *     - `cd $VAR && git push`                — shell variable; can't
 *                                              statically resolve, treat
 *                                              as cross-repo (be lenient)
 *     - `cd ~/foo && git push`               — home-relative
 *     - cd may appear after newlines or `;` separators in multi-line
 *       scripts, not just at command start.
 *
 *   Relative paths (`cd subdir`) are *not* treated as cross-repo, since
 *   they typically still resolve inside projectRoot.
 *
 *   Sub-shells `(cd /x && git push)` are not detected — rare enough to
 *   accept as an edge case; user can split into two Bash calls.
 *
 * @param {string} cmd shell command text
 * @param {string} projectRoot absolute path to project root
 * @returns {boolean} true → exempt from gate (cross-repo push)
 */
function isCrossRepoPush(cmd, projectRoot) {
  if (typeof cmd !== 'string') return false;
  // Find first 'cd X' after start / newline / ; / && / ||
  const m = cmd.match(/(?:^|[\n;]|&&|\|\|)\s*cd\s+(\S+)/);
  if (!m) return false;
  let target = m[1];
  // Strip surrounding quotes
  target = target.replace(/^["']|["']$/g, '');
  // Shell variable / command substitution → assume cross-repo
  if (target.startsWith('$') || target.startsWith('`') || target.includes('$(')) {
    return true;
  }
  // Home-relative
  if (target.startsWith('~')) {
    target = target.replace(/^~/, os.homedir());
  }
  // Relative path → assume same repo
  if (!target.startsWith('/')) return false;
  // Absolute path → strict containment check
  try {
    const resolvedTarget = path.resolve(target);
    const resolvedRoot = path.resolve(projectRoot);
    // Same-path → same repo, NOT cross-repo
    if (resolvedTarget === resolvedRoot) return false;
    // Strictly inside → same repo
    if (isInsideProjectRoot(target, projectRoot)) return false;
    // Sibling, parent, or unrelated path → cross-repo
    return true;
  } catch {
    return false;
  }
}

function readLastPass() {
  try {
    const raw = fs.readFileSync(LAST_PASS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Validate the marker's `ts` and report the problem, or null if it's fine.
 *
 * Why this is a named, tested function rather than one inline comparison:
 *
 *   The original check was `now - ts > staleThresholdMs`, which silently
 *   treats ANY future timestamp as fresh forever — `now - ts` goes negative
 *   and a negative is never greater than the threshold. Found in the wild
 *   (2026-07-19): a marker written with `date +%s%3N` on a machine where
 *   `%3N` is not supported got a 19-digit NANOSECOND ts. `now - ts` was
 *   ≈ -1.78e18 → judged FRESH → the 2h TTL was inert for that marker, with
 *   nothing anywhere reporting that the time-based half of the gate had
 *   stopped guarding.
 *
 *   Any future ts does this — wrong unit, a typo'd extra digit, or a clock
 *   jump. The fix is to stop assuming the value is a sane epoch-ms and check
 *   it, because a security gate that fails silently is worse than one that
 *   is absent: absent gates get noticed.
 *
 * Fails closed: unparseable / future / stale all return a reason (→ block).
 * A small future tolerance absorbs benign clock skew between the writer and
 * this process without reopening the hole.
 */
const TS_FUTURE_TOLERANCE_MS = 60 * 1000;

function markerTsProblem(ts, now, staleThresholdMs) {
  const n = Number(ts);
  if (!Number.isFinite(n)) {
    return 'marker `ts` is not a number (expected Unix epoch MILLISECONDS)';
  }
  if (n > now + TS_FUTURE_TOLERANCE_MS) {
    const digits = String(Math.trunc(Math.abs(n))).length;
    return (
      `marker \`ts\` is in the future (${n}, ${digits} digits) — expected Unix ` +
      `epoch MILLISECONDS (13 digits). A nanosecond/microsecond value makes ` +
      `the ${STALE_HOURS}h TTL never expire, so it is rejected. Write it with ` +
      `Date.now() or python3 -c "import time;print(int(time.time()*1000))" ` +
      `(NOT \`date +%s%3N\` — %N is unsupported on some platforms and yields ns).`
    );
  }
  if (now - n > staleThresholdMs) {
    return `last pass was ${Math.round((now - n) / 60000)} min ago, stale (> ${STALE_HOURS}h)`;
  }
  return null;
}

function main() {
  const payload = readStdinJSON();
  const toolName = payload.tool_name || '';
  if (toolName !== 'Bash') {
    process.exit(0);
  }
  const cmd = (payload.tool_input && payload.tool_input.command) || '';
  if (!isCommitOrPush(cmd)) {
    process.exit(0);
  }

  const projectRoot = getProjectRoot(payload);

  // Cross-repo push exemption (2026-05-03):
  // If the command cd's outside projectRoot before pushing, the push
  // targets a different git repo. projectRoot's marker doesn't apply.
  if (isCrossRepoPush(cmd, projectRoot)) {
    process.exit(0);
  }

  const mode = readTaskMode(projectRoot);
  if (mode !== 'heavy') {
    process.exit(0);
  }

  const lastPass = readLastPass();
  const now = Date.now();
  const staleThresholdMs = STALE_HOURS * 60 * 60 * 1000;

  // Validate marker in layers — any failure blocks with a specific hint.
  let reason = null;
  if (!lastPass) {
    reason = 'evaluation-loop has never run (or state file missing)';
  } else if (!lastPass.ts) {
    reason = 'marker missing `ts` field';
  } else if (markerTsProblem(lastPass.ts, now, staleThresholdMs)) {
    reason = markerTsProblem(lastPass.ts, now, staleThresholdMs);
  } else if (!lastPass.git_head) {
    reason = 'marker missing `git_head` — Reality Checker output must anchor to a commit';
  } else {
    const head = currentGitHead(projectRoot);
    if (head && head !== lastPass.git_head) {
      reason = `marker git_head=${lastPass.git_head} diverges from current HEAD=${head}; code changed since evaluation — re-run`;
    } else if (!lastPass.evaluator_agent_id || String(lastPass.evaluator_agent_id).length < 3) {
      reason = 'marker missing `evaluator_agent_id` (Task tool agent id of the independent Reality Checker)';
    } else if (
      !lastPass.verdict_summary ||
      String(lastPass.verdict_summary).trim().length < MIN_SUMMARY_LEN
    ) {
      reason = `marker \`verdict_summary\` too short (< ${MIN_SUMMARY_LEN} chars) — paste the Reality Checker verdict, not a placeholder`;
    }
  }

  if (reason) {
    const msg =
      `[evaluation-gate] BLOCK: Heavy mode commit without valid evaluation-loop pass.\n` +
      `  Reason: ${reason}\n` +
      `  Fix:\n` +
      `    1. Run \`/evaluation-loop\` (preferred) or \`/verify pre-pr\`\n` +
      `    2. When Reality Checker returns ACCEPTED, write the marker with Write tool:\n` +
      `       path: ~/.claude/state/evaluation-gate/last-pass.json\n` +
      `       schema: {"ts": <Date.now() — epoch MILLISECONDS, 13 digits;\n` +
      `                       NOT \`date +%s%3N\` (yields ns on some platforms)>,\n` +
      `                "git_head": "<short hash of HEAD>",\n` +
      `                "mode": "heavy", "round": <N>,\n` +
      `                "evaluator_agent_id": "<Task agent id>",\n` +
      `                "verdict_summary": "<Reality Checker's one-line ACCEPTED reason, >=10 chars>"}\n` +
      `    3. Retry the git commit\n` +
      `  Rationale: ~/.claude/CLAUDE.md §任务模式路由 Heavy chain requires evaluation-loop\n` +
      `             before ship. This hook enforces that at commit time.\n` +
      `             git_head pin ensures marker invalidates on any code change.\n`;
    process.stderr.write(msg);
    process.exit(2);
  }

  process.exit(0);
}

// Exports for unit tests (loaded via require()).
module.exports = {
  isInsideProjectRoot,
  isCrossRepoPush,
  isCommitOrPush,
  markerTsProblem,
};

// Only run main() when invoked directly as a hook, not when require()'d.
if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `[evaluation-gate] non-fatal error: ${err && err.message ? err.message : err}\n`
    );
    process.exit(0); // never block on hook bug
  }
}
