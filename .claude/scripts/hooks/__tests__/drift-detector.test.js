#!/usr/bin/env node
/**
 * Unit tests for drift-detector.js (2026-07-04 scoring-model redesign).
 *
 * Categories (per hooks/__tests__/README.md): state file (normalizeState
 * migration + persisted shape), mode gate (fast skip via E2E), 改 context
 * (band edge-triggered additionalContext), 解析 (logicalDir monorepo
 * normalization + revert/test regexes). All covered.
 *
 * Regression pins for the 2026-07-03 celue false-positive incident:
 *   - breadth is windowed, never accumulates across the session
 *   - multi-crate Rust workspace dirs normalize to one logical dir per crate
 *   - passing tests decay the score
 *   - CRITICAL injects once per band episode, not on every score change
 *   - score clamps at 100
 *
 * Pure-function tests run in-process. E2E tests spawn the hook with a temp
 * CLAUDE_PROJECT_ROOT so state files never touch a real project.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/drift-detector.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'drift-detector.js');
const {
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
} = require(HOOK_PATH);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); process.stdout.write(`  ✗ ${name}\n    ${e.message}\n`); }
}

function freshState() {
  return normalizeState(null);
}

// ── 解析: logicalDir ─────────────────────────────────────────

test('logicalDir: multi-crate workspace collapses to one dir per crate', () => {
  const root = '/r/quant';
  assert.strictEqual(logicalDir('/r/quant/crates/hft-master/src/main.rs', root), 'crates/hft-master');
  assert.strictEqual(logicalDir('/r/quant/crates/hft-master/src/api/spot.rs', root), 'crates/hft-master');
  assert.strictEqual(logicalDir('/r/quant/crates/hft-exchange/src/ibkr/order.rs', root), 'crates/hft-exchange');
});

test('logicalDir: packages/ container normalizes like crates/', () => {
  assert.strictEqual(logicalDir('/r/p/packages/web/src/components/X.tsx', '/r/p'), 'packages/web');
});

test('logicalDir: non-monorepo path uses plain dirname', () => {
  assert.strictEqual(logicalDir('/r/p/src/components/X.tsx', '/r/p'), 'src/components');
});

test('logicalDir: file at project root maps to "."', () => {
  assert.strictEqual(logicalDir('/r/p/README.md', '/r/p'), '.');
});

test('logicalDir: file directly under container dir uses dirname', () => {
  assert.strictEqual(logicalDir('/r/p/crates/README.md', '/r/p'), 'crates');
});

test('logicalDir: only first container occurrence wins', () => {
  assert.strictEqual(logicalDir('/r/p/crates/foo/packages/bar/x.ts', '/r/p'), 'crates/foo');
});

test('logicalDir: path outside project root falls back to absolute dirname', () => {
  assert.strictEqual(logicalDir('/elsewhere/a/b.rs', '/r/p'), '/elsewhere/a');
});

// ── computeBreadth: level, not accumulator ───────────────────

function seedEdits(state, specs, root = '/r/p') {
  for (const [file, n] of specs) {
    for (let i = 0; i < (n || 1); i++) pushEdit(state, file, root);
  }
}

test('breadth: empty window → 0', () => {
  assert.strictEqual(computeBreadth([]), 0);
});

test('breadth: 4 dirs → 0 (below threshold)', () => {
  const s = freshState();
  seedEdits(s, [['/r/p/a/1.ts'], ['/r/p/b/1.ts'], ['/r/p/c/1.ts'], ['/r/p/d/1.ts']]);
  assert.strictEqual(computeBreadth(s.recentEdits), 0);
});

test('breadth: 5 dirs → 10', () => {
  const s = freshState();
  seedEdits(s, [['/r/p/a/1.ts'], ['/r/p/b/1.ts'], ['/r/p/c/1.ts'], ['/r/p/d/1.ts'], ['/r/p/e/1.ts']]);
  assert.strictEqual(computeBreadth(s.recentEdits), 10);
});

test('breadth: 10 dirs → 20 (capped dir component)', () => {
  const s = freshState();
  seedEdits(s, 'abcdefghij'.split('').map(d => [`/r/p/${d}/1.ts`]));
  assert.strictEqual(computeBreadth(s.recentEdits), 20);
});

test('breadth: same file ×3 in window → 5; ×6 → 10', () => {
  const s3 = freshState();
  seedEdits(s3, [['/r/p/a/1.ts', 3]]);
  assert.strictEqual(computeBreadth(s3.recentEdits), 5);
  const s6 = freshState();
  seedEdits(s6, [['/r/p/a/1.ts', 6]]);
  assert.strictEqual(computeBreadth(s6.recentEdits), 10);
});

test('breadth: max is 30 (20 dirs + 10 repeats) — can warn, never critical alone', () => {
  const s = freshState();
  seedEdits(s, 'abcdefghij'.split('').map(d => [`/r/p/${d}/1.ts`]));
  seedEdits(s, [['/r/p/a/1.ts', 6]]);
  const b = computeBreadth(s.recentEdits);
  assert.strictEqual(b, 30);
  assert.ok(b < CRITICAL_AT, 'breadth alone must stay below the critical band');
});

test('breadth: DECAYS when work localizes (regression pin: window, not session)', () => {
  const s = freshState();
  seedEdits(s, 'abcde'.split('').map(d => [`/r/p/${d}/1.ts`]));
  assert.strictEqual(computeBreadth(s.recentEdits), 10, 'broad phase should score 10');
  // Localize: WINDOW_SIZE edits in one dir evict the broad phase entirely
  seedEdits(s, [['/r/p/z/only.ts', WINDOW_SIZE]]);
  assert.strictEqual(s.recentEdits.length, WINDOW_SIZE, 'window must trim');
  assert.strictEqual(windowDirCount(s.recentEdits), 1);
  assert.strictEqual(computeBreadth(s.recentEdits), 10, 'only the repeat component remains (×30 → +10), dir component gone');
});

test('breadth: celue scenario — 3-crate workspace sweep stays at 0', () => {
  const s = freshState();
  const root = '/r/quant';
  seedEdits(s, [
    ['/r/quant/crates/hft-master/src/main.rs'],
    ['/r/quant/crates/hft-master/src/ws.rs'],
    ['/r/quant/crates/hft-master/src/api_spot.rs'],
    ['/r/quant/crates/hft-exchange/src/ibkr/order.rs'],
    ['/r/quant/crates/hft-exchange/src/ibkr/precision.rs'],
    ['/r/quant/crates/hft-proto/src/lib.rs'],
  ], root);
  assert.strictEqual(windowDirCount(s.recentEdits), 3, '3 crates = 3 logical dirs');
  assert.strictEqual(computeBreadth(s.recentEdits), 0);
});

// ── applyBashEvent: events + decay ───────────────────────────

test('events: git revert / checkout -- / restore each add 15', () => {
  for (const cmd of ['git revert HEAD', 'git checkout -- src/a.ts', 'git restore .']) {
    const s = freshState();
    applyBashEvent(s, cmd, '');
    assert.strictEqual(s.eventScore, 15, cmd);
    assert.strictEqual(s.revertCount, 1, cmd);
  }
});

test('events: unrelated bash command changes nothing', () => {
  const s = freshState();
  applyBashEvent(s, 'ls -la && git status', '');
  assert.strictEqual(s.eventScore, 0);
  assert.strictEqual(s.revertCount, 0);
});

test('events: failing tests only score once streak reaches 3', () => {
  const s = freshState();
  applyBashEvent(s, 'cargo test', 'error: test failed');
  applyBashEvent(s, 'cargo test', 'error: test failed');
  assert.strictEqual(s.eventScore, 0, 'streak of 2 must not score');
  applyBashEvent(s, 'cargo test', 'error: test failed');
  assert.strictEqual(s.eventScore, 5, 'third consecutive fail scores');
  assert.strictEqual(s.consecutiveTestFails, 3);
});

test('events: EVERY passing test run decays -10 (regression pin: not just fail→pass)', () => {
  const s = freshState();
  s.eventScore = 30;
  applyBashEvent(s, 'cargo test', 'test result: ok. 25 passed; 0 failed');
  assert.strictEqual(s.eventScore, 20);
  applyBashEvent(s, 'cargo test', 'test result: ok. 25 passed; 0 failed');
  assert.strictEqual(s.eventScore, 10, 'second green run must decay again');
});

test('events: passing run resets fail streak and floors at 0', () => {
  const s = freshState();
  s.consecutiveTestFails = 2;
  s.eventScore = 5;
  applyBashEvent(s, 'npm test', 'all tests passed');
  assert.strictEqual(s.consecutiveTestFails, 0);
  assert.strictEqual(s.eventScore, 0, 'must not go negative');
  assert.strictEqual(s.lastTestPassed, true);
});

test('events: "0 failed" in output counts as pass despite the word "failed"', () => {
  const s = freshState();
  s.eventScore = 15;
  applyBashEvent(s, 'cargo test', 'test result: ok. 42 passed; 0 failed; 0 ignored');
  assert.strictEqual(s.eventScore, 5);
});

test('events: eventScore clamps at 100 (regression pin: no 150%+ scores)', () => {
  const s = freshState();
  for (let i = 0; i < 10; i++) applyBashEvent(s, 'git revert HEAD', '');
  assert.strictEqual(s.eventScore, SCORE_CAP);
});

// ── decideInjection: band edge-trigger ───────────────────────

test('band: thresholds — <20 none, 20-39 warn, ≥40 critical', () => {
  assert.strictEqual(bandOf(0), 0);
  assert.strictEqual(bandOf(WARN_AT - 1), 0);
  assert.strictEqual(bandOf(WARN_AT), 1);
  assert.strictEqual(bandOf(CRITICAL_AT - 1), 1);
  assert.strictEqual(bandOf(CRITICAL_AT), 2);
});

test('inject: 0→25 warns once, staying in band is silent', () => {
  const first = decideInjection(0, 25);
  assert.deepStrictEqual(first, { band: 1, inject: 'warning' });
  const second = decideInjection(first.band, 28);
  assert.deepStrictEqual(second, { band: 1, inject: null });
});

test('inject: warn→critical escalation injects critical', () => {
  assert.deepStrictEqual(decideInjection(1, 45), { band: 2, inject: 'critical' });
});

test('inject: rising score WITHIN critical band stays silent (regression pin: 15+ CRITICAL spam)', () => {
  let band = decideInjection(0, 45).band;
  for (const score of [50, 55, 60, 80, 100]) {
    const r = decideInjection(band, score);
    assert.strictEqual(r.inject, null, `score ${score} must not re-inject`);
    band = r.band;
  }
});

test('inject: dropping below re-arms silently, re-escalation notifies again', () => {
  const drop = decideInjection(2, 10);
  assert.deepStrictEqual(drop, { band: 0, inject: null }, 'downgrade is silent');
  assert.deepStrictEqual(decideInjection(drop.band, 45), { band: 2, inject: 'critical' });
});

// ── normalizeState: migration from pre-2026-07 shape ─────────

test('state: legacy cumulative shape (score 150 + editedDirs) resets cleanly', () => {
  const s = normalizeState({
    score: 150,
    editedFiles: { '/a/b.rs': 9 },
    editedDirs: ['a', 'b', 'c', 'd', 'e', 'f'],
    consecutiveTestFails: 0,
    lastTestPassed: true,
    revertCount: 0,
  });
  assert.strictEqual(s.eventScore, 0, 'legacy inflated score must not seed eventScore');
  assert.deepStrictEqual(s.recentEdits, []);
  assert.strictEqual(s.lastInjectedBand, 0);
  assert.ok(!('editedDirs' in s) && !('editedFiles' in s), 'legacy fields dropped');
});

test('state: corrupt/missing input yields safe defaults', () => {
  for (const raw of [null, undefined, 'garbage', 42, { eventScore: 'NaN', recentEdits: 'nope', lastInjectedBand: 7 }]) {
    const s = normalizeState(raw);
    assert.strictEqual(s.eventScore, 0);
    assert.deepStrictEqual(s.recentEdits, []);
    assert.strictEqual(s.lastInjectedBand, 0);
  }
});

test('state: recentEdits trimmed to window and malformed entries filtered', () => {
  const edits = Array.from({ length: WINDOW_SIZE + 10 }, (_, i) => ({ file: `/f${i}`, dir: `d${i}` }));
  edits.push({ file: 42 }, null, 'x');
  const s = normalizeState({ recentEdits: edits });
  assert.strictEqual(s.recentEdits.length, WINDOW_SIZE);
  assert.ok(s.recentEdits.every(e => typeof e.file === 'string' && typeof e.dir === 'string'));
});

// ── E2E: subprocess with hermetic project root ───────────────

function runHook({ stdin, seedState = null, mode = 'standard', sessionId = 'driftsess' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-root-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  if (mode) fs.writeFileSync(path.join(root, '.claude', '.task-mode'), mode);
  if (seedState) {
    const dir = path.join(root, '.claude', '.drift-state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sessionId}.json`), JSON.stringify(seedState));
  }
  const r = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(stdin),
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_ROOT: root, CLAUDE_SESSION_ID: sessionId },
    encoding: 'utf8',
  });
  let stateOut = null;
  try {
    stateOut = JSON.parse(fs.readFileSync(path.join(root, '.claude', '.drift-state', `${sessionId}.json`), 'utf8'));
  } catch { /* no state written */ }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', state: stateOut, root };
}

function injectedText(r) {
  if (!r.stdout.trim()) return '';
  return JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || '';
}

test('e2e: fast mode skips entirely — no output, no state file', () => {
  const r = runHook({ stdin: { tool_name: 'Edit', tool_input: { file_path: '/x/a.ts' } }, mode: null });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.state, null);
});

test('e2e: standard mode single edit — state persisted in new shape, no injection', () => {
  const r = runHook({ stdin: { tool_name: 'Edit', tool_input: { file_path: path.join(os.tmpdir(), 'whatever', 'src', 'a.ts') } } });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '', 'healthy edit must not inject');
  assert.ok(r.state, 'state file must exist');
  assert.strictEqual(r.state.recentEdits.length, 1);
  assert.strictEqual(r.state.eventScore, 0);
  assert.ok(!('editedDirs' in r.state), 'new shape only');
});

test('e2e: revert crossing into critical injects once with valid envelope', () => {
  const seed = { ...normalizeState(null), eventScore: 30, lastInjectedBand: 1 };
  const r = runHook({
    stdin: { tool_name: 'Bash', tool_input: { command: 'git revert HEAD' }, tool_output: '' },
    seedState: seed,
  });
  const text = injectedText(r);
  assert.ok(text.includes('CRITICAL'), `expected CRITICAL injection, got: ${text || '(empty)'}`);
  assert.ok(text.includes('/verify'));
  assert.strictEqual(r.state.lastInjectedBand, 2);
});

test('e2e: already-injected critical band stays silent on further edits (regression pin)', () => {
  const seed = { ...normalizeState(null), eventScore: 60, lastInjectedBand: 2 };
  const r = runHook({
    stdin: { tool_name: 'Edit', tool_input: { file_path: '/x/src/a.ts' } },
    seedState: seed,
  });
  assert.strictEqual(r.stdout, '', 'no re-injection while band unchanged');
  assert.strictEqual(r.state.lastInjectedBand, 2);
});

test('e2e: legacy state file (score 150) does not spam — recomputed score is sane', () => {
  const seed = { score: 150, editedFiles: { '/a.rs': 12 }, editedDirs: ['a', 'b', 'c', 'd', 'e', 'f'], consecutiveTestFails: 0, lastTestPassed: null, revertCount: 0 };
  const r = runHook({
    stdin: { tool_name: 'Edit', tool_input: { file_path: '/x/src/a.ts' } },
    seedState: seed,
  });
  assert.strictEqual(r.stdout, '', 'legacy inflated score must not trigger injection');
  assert.ok(r.state.score <= 5, `recomputed score should be near 0, got ${r.state.score}`);
});

test('e2e: green cargo test decays a warned session below the band', () => {
  const seed = { ...normalizeState(null), eventScore: 25, lastInjectedBand: 1 };
  const r = runHook({
    stdin: { tool_name: 'Bash', tool_input: { command: 'cargo test' }, tool_output: 'test result: ok. 10 passed; 0 failed' },
    seedState: seed,
  });
  assert.strictEqual(r.state.eventScore, 15);
  assert.strictEqual(r.state.lastInjectedBand, 0, 'band re-armed after decay');
  assert.strictEqual(r.stdout, '');
});

// ── Summary ──────────────────────────────────────────────────

process.stdout.write(`\n${passed} pass / ${failed} fail\n`);
if (failed > 0) {
  process.stdout.write(failures.map(f => `  FAIL: ${f}`).join('\n') + '\n');
}
process.exit(failed > 0 ? 1 : 0);
