#!/usr/bin/env node
'use strict';
/**
 * Unit tests for pre-tool-escalate.js (2026-06-06 deadlock fix).
 *
 * Focus: the segment-aware, quote-stripped risk matching that broke the
 * evaluation-gate deadlock. Asserts that version-control mechanics and the
 * set-mode.js de-escalation CLI do NOT escalate, while genuine risk signals
 * and cross-file accumulation still do.
 *
 * NOTE on scope: `rm -rf` is NOT a pre-tool-escalate signal — destructive
 * command interception is careful-guard.js's domain (separation of concerns).
 * "Real risk still escalates" is therefore proven with the signals this hook
 * actually owns: deploy/terraform/migrate/secret-rotation + file accumulation.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/pre-tool-escalate.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

const assert = require('assert');
const path = require('path');
const {
  detectEscalation,
  accumulationMode,
  extractFilePath,
} = require(path.join(__dirname, '..', 'pre-tool-escalate.js'));

let pass = 0;
let fail = 0;
const failures = [];
function t(name, fn) {
  try {
    fn();
    pass++;
    process.stdout.write(`  ok ${name}\n`);
  } catch (err) {
    fail++;
    failures.push({ name, err });
    process.stdout.write(`  FAIL ${name}: ${err.message}\n`);
  }
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

// ─── The deadlock: these must NOT escalate ───────────────────────────
process.stdout.write('no-escalation (deadlock fix):\n');

t('set-mode.js reset command does NOT escalate', () => {
  assert.strictEqual(
    detectEscalation(bash('node /Users/hi/.claude/scripts/hooks/set-mode.js --reset standard --force')),
    null
  );
});

t('set-mode.js with risky words in --reason does NOT escalate', () => {
  // "deploy"/"auth"/"secret" in the reason would match HEAVY patterns if the
  // segment were scanned — the set-mode skip prevents it.
  assert.strictEqual(
    detectEscalation(bash('node set-mode.js --reset standard --reason "unblock the deploy auth secret push"')),
    null
  );
});

t('set-mode reset chained with git push does NOT escalate', () => {
  // The exact [2026-05-20] deadlock shape.
  assert.strictEqual(
    detectEscalation(bash('node set-mode.js --reset standard --force && git push origin main')),
    null
  );
});

t('pure git commit does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('git commit -m "fix bug"')), null);
});

t('pure git push does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('git push origin main')), null);
  assert.strictEqual(detectEscalation(bash('git push --force-with-lease')), null);
});

t('pure git add does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('git add -A')), null);
});

t('commit message containing risk words does NOT escalate', () => {
  // "deploy" lives inside the quoted message → stripped before matching.
  assert.strictEqual(detectEscalation(bash('git commit -m "prep deploy of auth service"')), null);
});

t('cross-command keyword+verb span does NOT falsely escalate', () => {
  // "secret" in segment 1, "set" in segment 2 — must not match the
  // (keyword).*(verb) HEAVY pattern across the && boundary.
  assert.strictEqual(detectEscalation(bash('cat secret.txt && echo set')), null);
});

// ─── Genuine risk: these MUST still escalate ─────────────────────────
process.stdout.write('\nstill-escalates (real risk):\n');

t('terraform → heavy', () => {
  assert.deepStrictEqual(detectEscalation(bash('terraform apply')).mode, 'heavy');
});

t('deploy script → heavy', () => {
  assert.strictEqual(detectEscalation(bash('./deploy.sh prod')).mode, 'heavy');
});

t('docker push → heavy', () => {
  assert.strictEqual(detectEscalation(bash('docker push myimage:latest')).mode, 'heavy');
});

t('migrate → heavy', () => {
  assert.strictEqual(detectEscalation(bash('npm run migrate')).mode, 'heavy');
});

t('secret set (keyword+verb, single segment) → heavy', () => {
  // HEAVY pattern is (keyword).*(verb) — order-sensitive, keyword before verb.
  // `gh secret set NAME` is the canonical real command this guards.
  assert.strictEqual(detectEscalation(bash('gh secret set MY_TOKEN abc')).mode, 'heavy');
});

t('npm install → standard', () => {
  assert.strictEqual(detectEscalation(bash('npm install lodash')).mode, 'standard');
});

t('risk signal survives when chained after a set-mode segment', () => {
  // set-mode segment is skipped, but a real risky segment after it still fires.
  assert.strictEqual(
    detectEscalation(bash('node set-mode.js --reset standard && terraform apply')).mode,
    'heavy'
  );
});

// ─── Edit/Write path signals unchanged ───────────────────────────────
process.stdout.write('\nEdit/Write path signals (unchanged):\n');

t('editing an auth/ dir → heavy', () => {
  assert.strictEqual(
    detectEscalation({ tool_name: 'Edit', tool_input: { file_path: 'src/auth/login.ts' } }).mode,
    'heavy'
  );
});

t('editing an api/ dir → standard', () => {
  assert.strictEqual(
    detectEscalation({ tool_name: 'Write', tool_input: { file_path: 'src/api/users.ts' } }).mode,
    'standard'
  );
});

t('editing an ordinary file → null', () => {
  assert.strictEqual(
    detectEscalation({ tool_name: 'Edit', tool_input: { file_path: 'src/utils/format.ts' } }),
    null
  );
});

t('extractFilePath returns Edit/Write target, null for Bash', () => {
  assert.strictEqual(extractFilePath({ tool_name: 'Edit', tool_input: { file_path: 'a/b.ts' } }), 'a/b.ts');
  assert.strictEqual(extractFilePath(bash('git push')), null);
});

// ─── Cross-file accumulation thresholds ──────────────────────────────
process.stdout.write('\ncross-file accumulation:\n');

t('< 3 files → no accumulation escalation', () => {
  assert.strictEqual(accumulationMode(0), null);
  assert.strictEqual(accumulationMode(2), null);
});

t('3-5 files → standard', () => {
  assert.strictEqual(accumulationMode(3), 'standard');
  assert.strictEqual(accumulationMode(5), 'standard');
});

t('6+ files → heavy', () => {
  assert.strictEqual(accumulationMode(6), 'heavy');
  assert.strictEqual(accumulationMode(12), 'heavy');
});

// ─── Result ──────────────────────────────────────────────────────────
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  ${f.name}: ${f.err.stack || f.err.message}\n`);
  process.exit(1);
}
process.exit(0);
