#!/usr/bin/env node
/**
 * Unit tests for evaluation-gate.js path-containment logic.
 *
 * Bug fixed (2026-05-06): isCrossRepoPush used `resolved.startsWith(projectRoot)`
 * which falsely matched sibling paths (e.g. `/Users/hi/quant-deploy-s2`
 * starts with `/Users/hi/quant-deploy`). The fix uses `path.relative`
 * for true containment checks.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/evaluation-gate.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const os = require('os');

const { isInsideProjectRoot, isCrossRepoPush, isCommitOrPush } = require(
  path.join(__dirname, '..', 'evaluation-gate.js')
);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ok ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    process.stdout.write(`  FAIL ${name}: ${err.message}\n`);
  }
}

// ─── isInsideProjectRoot ──────────────────────────────────────────────

process.stdout.write('isInsideProjectRoot:\n');

test('sibling worktree is NOT inside (the original bug)', () => {
  // /Users/hi/quant-deploy-s2 vs /Users/hi/quant-deploy
  // String prefix would say true; path.relative says "../quant-deploy-s2".
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy-s2', '/Users/hi/quant-deploy'),
    false
  );
});

test('nested subdirectory IS inside', () => {
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy/celue-main', '/Users/hi/quant-deploy'),
    true
  );
});

test('deeply nested subdirectory IS inside', () => {
  assert.strictEqual(
    isInsideProjectRoot(
      '/Users/hi/quant-deploy/quant_base-main/crates/hft-types/src',
      '/Users/hi/quant-deploy'
    ),
    true
  );
});

test('same path is NOT strictly inside (rel === "")', () => {
  // Per spec: isInsideProjectRoot is strict containment.
  // Same-path is handled separately in isCrossRepoPush.
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy', '/Users/hi/quant-deploy'),
    false
  );
});

test('completely unrelated path is NOT inside', () => {
  assert.strictEqual(
    isInsideProjectRoot('/tmp/other-repo', '/Users/hi/quant-deploy'),
    false
  );
});

test('parent directory is NOT inside', () => {
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi', '/Users/hi/quant-deploy'),
    false
  );
});

test('trailing slashes do not break the check', () => {
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy/celue-main/', '/Users/hi/quant-deploy/'),
    true
  );
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy-s2/', '/Users/hi/quant-deploy/'),
    false
  );
});

test('path normalization handles . and ..', () => {
  assert.strictEqual(
    isInsideProjectRoot('/Users/hi/quant-deploy/./celue-main', '/Users/hi/quant-deploy'),
    true
  );
  assert.strictEqual(
    isInsideProjectRoot(
      '/Users/hi/quant-deploy/celue-main/../../quant-deploy-s2',
      '/Users/hi/quant-deploy'
    ),
    false
  );
});

// ─── isCrossRepoPush (the actual hook entry point) ────────────────────

process.stdout.write('\nisCrossRepoPush:\n');

const ROOT = '/Users/hi/quant-deploy';

test('cd to sibling worktree IS cross-repo (regression case)', () => {
  // The exact scenario from Phase A / Phase B that motivated this fix.
  assert.strictEqual(
    isCrossRepoPush('cd /Users/hi/quant-deploy-s2 && git commit -m "x"', ROOT),
    true
  );
});

test('cd to nested subdirectory is NOT cross-repo', () => {
  assert.strictEqual(
    isCrossRepoPush('cd /Users/hi/quant-deploy/celue-main && git push', ROOT),
    false
  );
});

test('cd to projectRoot itself is NOT cross-repo', () => {
  // Same-path equality short-circuit.
  assert.strictEqual(
    isCrossRepoPush('cd /Users/hi/quant-deploy && git commit', ROOT),
    false
  );
});

test('cd to /tmp/other-repo IS cross-repo', () => {
  assert.strictEqual(
    isCrossRepoPush('cd /tmp/other-repo && git push origin main', ROOT),
    true
  );
});

test('plain git commit (no cd) is NOT cross-repo', () => {
  assert.strictEqual(isCrossRepoPush('git commit -m "fix"', ROOT), false);
  assert.strictEqual(isCrossRepoPush('git push', ROOT), false);
});

test('relative cd is NOT cross-repo (assumed inside projectRoot)', () => {
  assert.strictEqual(isCrossRepoPush('cd subdir && git commit', ROOT), false);
});

test('cd $VAR treated as cross-repo (lenient — cannot resolve)', () => {
  assert.strictEqual(isCrossRepoPush('cd $REPO && git push', ROOT), true);
});

test('cd ~/sibling expands home and detects cross-repo', () => {
  // Only meaningful when HOME is /Users/hi (matches projectRoot prefix).
  if (os.homedir() === '/Users/hi') {
    assert.strictEqual(
      isCrossRepoPush('cd ~/quant-deploy-s2 && git commit', ROOT),
      true
    );
    assert.strictEqual(
      isCrossRepoPush('cd ~/quant-deploy/celue-main && git commit', ROOT),
      false
    );
  }
});

test('multi-line script with cd inside is detected', () => {
  const cmd = 'echo "deploying"\ncd /Users/hi/quant-deploy-s2\ngit push';
  assert.strictEqual(isCrossRepoPush(cmd, ROOT), true);
});

test('quoted cd target is unwrapped', () => {
  assert.strictEqual(
    isCrossRepoPush('cd "/Users/hi/quant-deploy-s2" && git commit', ROOT),
    true
  );
  assert.strictEqual(
    isCrossRepoPush("cd '/Users/hi/quant-deploy-s2' && git push", ROOT),
    true
  );
});

// ─── isCommitOrPush (sanity) ──────────────────────────────────────────

process.stdout.write('\nisCommitOrPush:\n');

test('matches git commit', () => {
  assert.strictEqual(isCommitOrPush('git commit -m "x"'), true);
  assert.strictEqual(isCommitOrPush('cd /tmp && git commit'), true);
});

test('matches git push', () => {
  assert.strictEqual(isCommitOrPush('git push'), true);
  assert.strictEqual(isCommitOrPush('git push origin main'), true);
});

test('does not match git status / log / diff', () => {
  assert.strictEqual(isCommitOrPush('git status'), false);
  assert.strictEqual(isCommitOrPush('git log'), false);
  assert.strictEqual(isCommitOrPush('git diff'), false);
});

test('does not match unrelated commands', () => {
  assert.strictEqual(isCommitOrPush('echo "git commit"'), false);
  assert.strictEqual(isCommitOrPush('npm install'), false);
});

// ─── Summary ──────────────────────────────────────────────────────────

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) {
    process.stdout.write(`  ${f.name}: ${f.err.stack || f.err.message}\n`);
  }
  process.exit(1);
}
process.exit(0);
