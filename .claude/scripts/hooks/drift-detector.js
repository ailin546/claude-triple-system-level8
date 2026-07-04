#!/usr/bin/env node
/**
 * Agent Drift Detector — WTF-Likelihood Heuristic
 *
 * PostToolUse hook that tracks a "suspicion score" to detect when an agent
 * is going off track (repeated reverts, scattered edits, consecutive test
 * failures).
 *
 * Inspired by gstack's QA WTF-likelihood mechanism.
 *
 * Scoring model (2026-07-04 redesign — see false-positive lesson below):
 *
 *   score = min(100, eventScore + breadth)
 *
 *   eventScore — cumulative, clamped 0..100, decays on green tests:
 *     +15 — git revert / checkout -- / restore
 *     +5  — each failing test run once the streak reaches 3
 *     -10 — each passing test run (not just fail→pass transitions)
 *
 *   breadth — recomputed fresh from a sliding window of the last
 *   WINDOW_SIZE Edit/Write events (never accumulates):
 *     +10 — 5+ unique logical dirs in window (+20 at 10+)
 *     +5  — same file edited 3+ times in window (+10 at 6+)
 *   Logical dirs normalize monorepo containers (crates/x, packages/x, ...)
 *   to one dir per crate/package. Breadth caps at 30 — breadth alone can
 *   reach the warning band but NEVER the critical band; scattered edits
 *   are weak evidence and only escalate combined with real event signals.
 *
 * At 20%: warning; at 40%: critical (recommend /verify). Injections are
 * edge-triggered on band transitions (none→warn→critical) via
 * lastInjectedBand — at most one injection per band episode; dropping
 * below a band silently re-arms it.
 *
 * Why the redesign (2026-07-03 celue session): the previous model
 * accumulated dirs-touched and per-file edit counts over the whole session
 * with no decay and no clamp. A legitimate multi-crate Rust workspace
 * session pushed the score to 150%+, and the scoreChanged gate was useless
 * because the score kept changing — 15+ CRITICAL injections, all false
 * positives, and passing `cargo test` could not lower the score.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getProjectRoot } = require('../lib/project-root');
const { requireMode } = require('../lib/mode-check');
const { emitAdditionalContext } = require('../lib/hook-output');

const PROJECT_ROOT = getProjectRoot();
const SESSION_ID = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
const STATE_DIR = path.join(PROJECT_ROOT, '.claude', '.drift-state');
const STATE_FILE = path.join(STATE_DIR, `${SESSION_ID}.json`);

// ── Tunables ─────────────────────────────────────────────────
const WINDOW_SIZE = 30;        // recent Edit/Write events kept for breadth
const DIR_WARN = 5;            // unique dirs in window → +10
const DIR_HIGH = 10;           // unique dirs in window → +20
const REPEAT_WARN = 3;         // same-file edits in window → +5
const REPEAT_HIGH = 6;         // same-file edits in window → +10
const REVERT_SCORE = 15;
const FAIL_STREAK_AT = 3;
const FAIL_STREAK_SCORE = 5;
const PASS_DECAY = 10;         // eventScore reduction per passing test run
const SCORE_CAP = 100;
const WARN_AT = 20;
const CRITICAL_AT = 40;

// Monorepo container dirs: files under <container>/<name>/... count as one
// logical dir per <name> (a multi-crate Rust workspace is one dir per crate,
// not one per src/ subtree).
const MONOREPO_CONTAINERS = new Set(['crates', 'packages', 'apps', 'libs', 'services']);

function clampScore(n) {
  return Math.max(0, Math.min(SCORE_CAP, n));
}

/**
 * Normalize a file path to its "logical" directory for breadth counting.
 * Inside a monorepo container the whole crate/package is one dir.
 */
function logicalDir(filePath, root = PROJECT_ROOT) {
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return path.dirname(filePath); // outside project root — absolute parent
  }
  const segments = rel.split(path.sep);
  for (let i = 0; i < segments.length - 2; i++) {
    if (MONOREPO_CONTAINERS.has(segments[i])) {
      return segments.slice(0, i + 2).join('/');
    }
  }
  const dir = path.dirname(rel);
  return dir === '' ? '.' : dir;
}

/** Append an edit event, trimming the window to WINDOW_SIZE. */
function pushEdit(state, filePath, root = PROJECT_ROOT) {
  state.recentEdits.push({ file: filePath, dir: logicalDir(filePath, root) });
  if (state.recentEdits.length > WINDOW_SIZE) {
    state.recentEdits.splice(0, state.recentEdits.length - WINDOW_SIZE);
  }
}

/** Breadth score recomputed fresh from the window — never accumulates. */
function computeBreadth(recentEdits) {
  let breadth = 0;
  const dirs = new Set();
  const fileCounts = {};
  let maxRepeat = 0;
  for (const e of recentEdits) {
    dirs.add(e.dir);
    fileCounts[e.file] = (fileCounts[e.file] || 0) + 1;
    if (fileCounts[e.file] > maxRepeat) maxRepeat = fileCounts[e.file];
  }
  if (dirs.size >= DIR_HIGH) breadth += 20;
  else if (dirs.size >= DIR_WARN) breadth += 10;
  if (maxRepeat >= REPEAT_HIGH) breadth += 10;
  else if (maxRepeat >= REPEAT_WARN) breadth += 5;
  return breadth;
}

/** Count unique logical dirs in the window (for the injected message). */
function windowDirCount(recentEdits) {
  return new Set(recentEdits.map(e => e.dir)).size;
}

const REVERT_RE = /\bgit\s+revert\b|\bgit\s+checkout\s+--\s|\bgit\s+restore\b/;
const TEST_CMD_RE = /\b(test|jest|vitest|pytest|cargo test|go test|bun test|npm test)\b/;

/** Apply revert / test-result signals from a Bash call to eventScore. */
function applyBashEvent(state, command, output) {
  if (REVERT_RE.test(command)) {
    state.revertCount += 1;
    state.eventScore = clampScore(state.eventScore + REVERT_SCORE);
  }
  if (TEST_CMD_RE.test(command)) {
    const testFailed = /FAIL|FAILED|ERROR|error:|failed/i.test(output) && !/0 failed/i.test(output);
    if (testFailed) {
      state.consecutiveTestFails += 1;
      if (state.consecutiveTestFails >= FAIL_STREAK_AT) {
        state.eventScore = clampScore(state.eventScore + FAIL_STREAK_SCORE);
      }
      state.lastTestPassed = false;
    } else {
      // Every green run decays suspicion — a session that keeps verifying
      // (cargo test / npm test / /verify) earns its score back down.
      state.eventScore = Math.max(0, state.eventScore - PASS_DECAY);
      state.consecutiveTestFails = 0;
      state.lastTestPassed = true;
    }
  }
}

function bandOf(score) {
  return score >= CRITICAL_AT ? 2 : score >= WARN_AT ? 1 : 0;
}

/**
 * Edge-triggered injection: inject only when the band escalates past the
 * last injected band; a drop re-arms silently. Returns the new band to
 * store and which message (if any) to inject.
 */
function decideInjection(lastBand, score) {
  const band = bandOf(score);
  if (band > lastBand) {
    return { band, inject: band === 2 ? 'critical' : 'warning' };
  }
  return { band, inject: null };
}

/** Coerce any prior state shape (incl. pre-2026-07 cumulative model) to the current one. */
function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    eventScore: clampScore(Number(s.eventScore) || 0),
    score: Number(s.score) || 0, // recomputed every run; kept for observability
    recentEdits: Array.isArray(s.recentEdits)
      ? s.recentEdits.filter(e => e && typeof e.file === 'string' && typeof e.dir === 'string').slice(-WINDOW_SIZE)
      : [],
    consecutiveTestFails: Number(s.consecutiveTestFails) || 0,
    lastTestPassed: typeof s.lastTestPassed === 'boolean' ? s.lastTestPassed : null,
    revertCount: Number(s.revertCount) || 0,
    lastInjectedBand: s.lastInjectedBand === 1 || s.lastInjectedBand === 2 ? s.lastInjectedBand : 0,
  };
}

function loadState() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch {
    return normalizeState(null);
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Non-critical — if we can't save, we lose tracking but don't break the session
  }
}

function processInput(input) {
  let toolResult;
  try {
    toolResult = JSON.parse(input);
  } catch {
    return;
  }

  const toolName = toolResult.tool_name || '';
  const toolInput = toolResult.tool_input || {};
  const toolOutput = toolResult.tool_output || '';

  const state = loadState();

  if ((toolName === 'Edit' || toolName === 'Write') && toolInput.file_path) {
    pushEdit(state, toolInput.file_path);
  }

  if (toolName === 'Bash') {
    applyBashEvent(state, toolInput.command || '', typeof toolOutput === 'string' ? toolOutput : '');
  }

  const breadth = computeBreadth(state.recentEdits);
  state.score = Math.min(SCORE_CAP, state.eventScore + breadth);

  const { band, inject } = decideInjection(state.lastInjectedBand, state.score);
  state.lastInjectedBand = band;

  saveState(state);

  // NOTE: PostToolUse hooks cannot block (tool already executed). Warnings are
  // injected via additionalContext (visible to the model — plain stderr on an
  // exit-0 PostToolUse hook is NOT, see lib/hook-output.js).
  if (inject === 'critical') {
    emitAdditionalContext(
      `[drift-detector] CRITICAL: drift score ${state.score}% ` +
      `(events ${state.eventScore} + recent-edit breadth ${breadth}). ` +
      `Reverts: ${state.revertCount}, dirs in last ${state.recentEdits.length} edits: ${windowDirCount(state.recentEdits)}, ` +
      `consecutive test fails: ${state.consecutiveTestFails}. ` +
      `STOP and run /verify before continuing.`
    );
  } else if (inject === 'warning') {
    emitAdditionalContext(
      `[drift-detector] Warning: drift score ${state.score}% ` +
      `(events ${state.eventScore} + recent-edit breadth ${breadth}). ` +
      `Consider pausing to verify direction is correct.`
    );
  }
}

function main() {
  if (!requireMode('standard')) {
    // Fast mode — skip drift detection. Drain stdin and exit silently (no
    // passthrough: stdout is reserved for the additionalContext JSON envelope).
    process.stdin.on('data', () => {});
    process.stdin.on('end', () => process.exit(0));
    return;
  }

  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    data += chunk;
  });
  process.stdin.on('end', () => {
    processInput(data);
  });
}

module.exports = {
  WINDOW_SIZE,
  WARN_AT,
  CRITICAL_AT,
  SCORE_CAP,
  logicalDir,
  pushEdit,
  computeBreadth,
  windowDirCount,
  applyBashEvent,
  bandOf,
  decideInjection,
  normalizeState,
};

if (require.main === module) {
  main();
}
