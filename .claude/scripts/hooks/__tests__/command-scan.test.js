#!/usr/bin/env node
'use strict';
/**
 * Unit tests for lib/command-scan.js — shared command-structure helpers that
 * underpin two blocking hooks (pre-tool-escalate, evaluation-gate).
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/command-scan.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

const assert = require('assert');
const path = require('path');
const {
  stripQuotedStrings,
  splitSegments,
  gitSubcommand,
  isSetModeInvocation,
} = require(path.join(__dirname, '..', '..', 'lib', 'command-scan.js'));

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

// ─── stripQuotedStrings ──────────────────────────────────────────────
process.stdout.write('stripQuotedStrings:\n');

t('removes double-quoted content', () => {
  assert.strictEqual(stripQuotedStrings('git commit -m "fix git push bug"'), 'git commit -m ');
});

t('removes single-quoted content', () => {
  assert.strictEqual(stripQuotedStrings("echo 'deploy now'"), 'echo ');
});

t('preserves operators OUTSIDE quotes', () => {
  // The && must survive so segmentation still works.
  assert.strictEqual(stripQuotedStrings('echo "" && git push'), 'echo  && git push');
});

t('blanks dangling unbalanced opening quote to EOL', () => {
  assert.strictEqual(stripQuotedStrings('set-mode --reason "unblock git push'), 'set-mode --reason ');
});

t('non-string and empty return empty string', () => {
  assert.strictEqual(stripQuotedStrings(null), '');
  assert.strictEqual(stripQuotedStrings(''), '');
  assert.strictEqual(stripQuotedStrings(undefined), '');
});

// ─── splitSegments ───────────────────────────────────────────────────
process.stdout.write('\nsplitSegments:\n');

t('splits on && and trims', () => {
  assert.deepStrictEqual(splitSegments('set-mode --reset standard && git push'), [
    'set-mode --reset standard',
    'git push',
  ]);
});

t('splits on ; || | and &', () => {
  assert.deepStrictEqual(splitSegments('a ; b || c | d & e'), ['a', 'b', 'c', 'd', 'e']);
});

t('splits on newlines', () => {
  assert.deepStrictEqual(splitSegments('cd /tmp\ngit push'), ['cd /tmp', 'git push']);
});

t('operators inside quotes do NOT split', () => {
  // The "a && b" is a commit message, one segment.
  assert.deepStrictEqual(splitSegments('git commit -m "a && b"'), ['git commit -m']);
});

t('empty / whitespace yields no segments', () => {
  assert.deepStrictEqual(splitSegments('   '), []);
  assert.deepStrictEqual(splitSegments(''), []);
});

// ─── gitSubcommand ───────────────────────────────────────────────────
process.stdout.write('\ngitSubcommand:\n');

t('git commit → commit', () => {
  assert.strictEqual(gitSubcommand('git commit -m x'), 'commit');
});

t('git push → push', () => {
  assert.strictEqual(gitSubcommand('git push origin main'), 'push');
});

t('git status / log / diff → that subcommand', () => {
  assert.strictEqual(gitSubcommand('git status'), 'status');
  assert.strictEqual(gitSubcommand('git log --oneline'), 'log');
});

t('git as ARGUMENT is not a git head: echo git push → null', () => {
  assert.strictEqual(gitSubcommand('echo git push'), null);
});

t('sudo / env prefix before git still detected', () => {
  assert.strictEqual(gitSubcommand('sudo git push'), 'push');
  assert.strictEqual(gitSubcommand('GIT_SSH_COMMAND= git push'), 'push');
});

t('non-git command → null', () => {
  assert.strictEqual(gitSubcommand('npm install'), null);
  assert.strictEqual(gitSubcommand('node set-mode.js heavy'), null);
});

// ─── isSetModeInvocation ─────────────────────────────────────────────
process.stdout.write('\nisSetModeInvocation:\n');

t('node /abs/.../set-mode.js ... → true', () => {
  assert.strictEqual(
    isSetModeInvocation('node /Users/hi/.claude/scripts/hooks/set-mode.js --reset standard --force'),
    true
  );
});

t('bare set-mode.js → true', () => {
  assert.strictEqual(isSetModeInvocation('set-mode.js'), true);
  assert.strictEqual(isSetModeInvocation('node set-mode.js heavy'), true);
});

t('similarly-named file is NOT set-mode: foo-set-mode.js → false', () => {
  assert.strictEqual(isSetModeInvocation('node foo-set-mode.js'), false);
});

t('unrelated commands → false', () => {
  assert.strictEqual(isSetModeInvocation('git push'), false);
  assert.strictEqual(isSetModeInvocation('node get-mode.js --all'), false);
});

// ─── Result ──────────────────────────────────────────────────────────
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  ${f.name}: ${f.err.stack || f.err.message}\n`);
  process.exit(1);
}
process.exit(0);
