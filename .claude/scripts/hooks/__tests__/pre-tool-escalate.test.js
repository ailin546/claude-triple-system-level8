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
  isProseDocPath,
  trackFile,
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

// ─── Hyphenated-path false-positive (error-log 2026-06-13) ───────────
// JS `\b` treats `-` as a word boundary → /\bdeploy\b/ wrongly matched the
// project dir name `quant-deploy` in plain navigation/path args, re-escalating
// standard→heavy and deadlocking evaluation-gate on every commit. The
// hyphen-aware boundary must reject an adjacent `-` while keeping real verbs.
process.stdout.write('\nhyphenated-path false-positive (must NOT escalate):\n');

t('cd into a quant-deploy path does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('cd /Users/hi/quant-deploy')), null);
});

t('git -C with a quant-deploy path does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('git -C /home/ubuntu/quant-deploy commit -m "x"')), null);
});

t('ls of *.sh under a quant-deploy path does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('ls -la /Users/hi/quant-deploy/*.sh')), null);
});

t('hyphenated compound (re-deploy-tool / db-migrate-job) does NOT escalate', () => {
  assert.strictEqual(detectEscalation(bash('cat /opt/re-deploy-tool/readme')), null);
  assert.strictEqual(detectEscalation(bash('ls /srv/db-migrate-job/')), null);
});

t('chained set-mode reset + cd quant-deploy + git commit does NOT escalate', () => {
  // The exact shape that bit the 2026-06-13 commit flow.
  assert.strictEqual(
    detectEscalation(bash('node set-mode.js --reset standard --force && cd /Users/hi/quant-deploy && git commit -m x')),
    null
  );
});

// ─── Genuine risk: these MUST still escalate ─────────────────────────
process.stdout.write('\nstill-escalates (real risk):\n');

t('terraform → heavy', () => {
  assert.deepStrictEqual(detectEscalation(bash('terraform apply')).mode, 'heavy');
});

t('deploy script → heavy', () => {
  assert.strictEqual(detectEscalation(bash('./deploy.sh prod')).mode, 'heavy');
});

t('npm run deploy (space-preceded verb) → heavy', () => {
  // Hyphen-aware boundary must NOT over-correct: a real standalone `deploy`
  // verb still escalates; only adjacent-hyphen compounds (quant-deploy) are spared.
  assert.strictEqual(detectEscalation(bash('npm run deploy')).mode, 'heavy');
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

t('#6 risk hidden in a set-mode --reason command substitution still escalates', () => {
  // Codex review: `$(terraform apply)` EXECUTES even inside a set-mode reason;
  // the set-mode skip must not mask it. splitSegments surfaces it as a segment.
  assert.strictEqual(
    detectEscalation(bash('node set-mode.js --reset standard --reason "$(terraform apply)"')).mode,
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

// ─── Docs-batch false-positive (error-log 2026-07-16) ────────────────
// The counter is a proxy for module-spanning CODE complexity; routing.md
// classifies docs work as Fast. A batch mechanical edit of 18 markdown files
// (wikimind session) hit the 6-file threshold 3× in one day, re-escalating
// to heavy seconds after every manual reset and deadlocking docs-only
// commits against evaluation-gate. Prose docs must not enter filesTracked.
process.stdout.write('\ndocs-batch false-positive (must NOT count):\n');

const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } });

t('prose extensions classify as docs (case-insensitive)', () => {
  for (const p of [
    '/Users/hi/wikimind/docs/plan.md',
    'notes/overview.markdown',
    'guide/setup.rst',
    'book/ch1.adoc',
    'book/ch2.asciidoc',
    'todo.txt',
    'README.MD',
  ]) {
    assert.strictEqual(isProseDocPath(p), true, p);
  }
});

t('code/config/unknown extensions stay counted', () => {
  for (const p of [
    'src/main.ts', 'src/lib.rs', 'scripts/run.py',
    'package.json', 'ci/deploy.yaml', 'Cargo.toml',
    'docs/page.mdx',       // compiles to JSX — behavior-bearing
    'README',              // extensionless → unknown → counted (fail-closed)
    'src/util.md.ts',      // last extension wins
  ]) {
    assert.strictEqual(isProseDocPath(p), false, p);
  }
});

t('wikimind regression: 6 markdown edits → zero count → no escalation', () => {
  const escState = { filesTracked: [], lastToolUseAt: null };
  for (let i = 1; i <= 6; i++) {
    trackFile(escState, edit(`/Users/hi/wikimind/docs/superpowers/specs/doc-${i}.md`));
  }
  assert.strictEqual(escState.filesTracked.length, 0);
  assert.strictEqual(accumulationMode(escState.filesTracked.length), null);
});

t('mixed batch: 3 code + 3 docs → counts only code → standard, not heavy', () => {
  const escState = { filesTracked: [], lastToolUseAt: null };
  for (let i = 1; i <= 3; i++) trackFile(escState, edit(`src/mod-${i}.ts`));
  for (let i = 1; i <= 3; i++) trackFile(escState, edit(`docs/doc-${i}.md`));
  assert.strictEqual(escState.filesTracked.length, 3);
  assert.strictEqual(accumulationMode(escState.filesTracked.length), 'standard');
});

t('no over-correction: 6 code files still → heavy', () => {
  const escState = { filesTracked: [], lastToolUseAt: null };
  for (let i = 1; i <= 6; i++) trackFile(escState, edit(`src/mod-${i}.rs`));
  assert.strictEqual(accumulationMode(escState.filesTracked.length), 'heavy');
});

t('trackFile dedups repeats and ignores Bash inputs', () => {
  const escState = { filesTracked: [], lastToolUseAt: null };
  trackFile(escState, edit('src/a.ts'));
  trackFile(escState, edit('src/a.ts'));
  trackFile(escState, bash('git status'));
  assert.strictEqual(escState.filesTracked.length, 1);
});

// ─── Dir-name signal docs exemption (2026-07-17) ─────────────────────
// Dir-name signals fire on WHERE a file lives, but a prose doc inside
// docs/auth/ or docs/deploy/ is documentation ABOUT the sensitive area,
// not a change TO it. Without the exemption a single Edit of
// docs/deploy/guide.md jumped straight to heavy (no threshold, unlike the
// counter) and interlocked with evaluation-gate on docs-only commits —
// same legitimate-work-shape class. Exposure verified in real repos
// (cc/paperclip docs/deploy/ ×9, docs/api/ ×11) though no incident yet.
process.stdout.write('\ndir-name docs exemption (must NOT escalate):\n');

t('prose doc under a heavy dir (auth/) → null', () => {
  assert.strictEqual(detectEscalation(edit('docs/auth/setup.md')), null);
});

t('prose doc under a heavy dir (deploy/) → null', () => {
  assert.strictEqual(
    detectEscalation(edit('/Users/hi/cc/paperclip/docs/deploy/guide.md')),
    null
  );
});

t('prose doc under a standard dir (api/) → null', () => {
  assert.strictEqual(detectEscalation(edit('docs/api/costs.md')), null);
});

t('README directly inside a risk-dir root → null', () => {
  assert.strictEqual(
    detectEscalation({ tool_name: 'Write', tool_input: { file_path: 'shared-state/README.md' } }),
    null
  );
});

t('no over-correction: code in auth/ still → heavy', () => {
  assert.strictEqual(detectEscalation(edit('src/auth/token.ts')).mode, 'heavy');
});

t('no over-correction: behavior-bearing files in risk dirs still escalate', () => {
  assert.strictEqual(detectEscalation(edit('config/settings.json')).mode, 'standard');
  assert.strictEqual(detectEscalation(edit('deploy/run.sh')).mode, 'heavy');
  assert.strictEqual(detectEscalation(edit('docs/deploy/guide.mdx')).mode, 'heavy'); // .mdx compiles to JSX
  assert.strictEqual(detectEscalation(edit('auth/Dockerfile')).mode, 'heavy');       // extensionless → fail-closed
});

// ─── Result ──────────────────────────────────────────────────────────
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  ${f.name}: ${f.err.stack || f.err.message}\n`);
  process.exit(1);
}
process.exit(0);
