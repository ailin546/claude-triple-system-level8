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
const fs = require('fs');
const { execFileSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'evaluation-gate.js');
const { isInsideProjectRoot, isCrossRepoPush, isCommitOrPush } = require(HOOK_PATH);

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

// ─── isCommitOrPush: deadlock cases (2026-06-06) ──────────────────────

test('git push/commit MENTIONED in a quoted --reason is NOT a commit/push', () => {
  // The [2026-05-20] deadlock: resetting the mode must not look like a push.
  assert.strictEqual(
    isCommitOrPush('node set-mode.js --reset standard --reason "unblock git push deadlock"'),
    false
  );
  assert.strictEqual(
    isCommitOrPush('node set-mode.js --reset standard --reason "stop the git commit loop"'),
    false
  );
});

test('git push/commit inside a commit MESSAGE still counts (it IS a commit)', () => {
  // The outer command really is a commit; the message text is incidental.
  assert.strictEqual(isCommitOrPush('git commit -m "mention git push in body"'), true);
});

test('git as an argument is not a commit/push', () => {
  assert.strictEqual(isCommitOrPush('echo git push'), false);
});

test('#1 git global options do not hide a real push/commit from the gate', () => {
  // Codex review: `git --no-pager push` / `git -c x=y commit` previously
  // returned false → bypassed the Heavy gate.
  assert.strictEqual(isCommitOrPush('git --no-pager push origin main'), true);
  assert.strictEqual(isCommitOrPush('git -c user.email=x commit -m y'), true);
  assert.strictEqual(isCommitOrPush('git -C /repo push'), true);
});

test('#2 backslash-newline continued git push is still a push', () => {
  assert.strictEqual(isCommitOrPush('git \\\n push origin main'), true);
});

// ─── Integration: gate blocks/allows via subprocess (hermetic HOME) ───
// os.homedir() honors $HOME, so we run the real hook with a throwaway HOME
// (no marker file) and a throwaway projectRoot whose .task-mode = heavy.
// This NEVER touches the real ~/.claude/state marker.

process.stdout.write('\ngate integration (subprocess):\n');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'evalgate-home-'));
const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'evalgate-proj-'));
fs.mkdirSync(path.join(tmpProject, '.claude'), { recursive: true });
fs.writeFileSync(path.join(tmpProject, '.claude', '.task-mode'), 'heavy');

function cleanupGateTmp() {
  for (const d of [tmpHome, tmpProject]) {
    if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  }
}
process.on('exit', cleanupGateTmp);
process.on('SIGINT', () => { cleanupGateTmp(); process.exit(1); });

/** Run the hook with command `cmd`; returns exit code (2 = blocked). */
function runGate(cmd) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: tmpProject });
  try {
    execFileSync('node', [HOOK_PATH], {
      input: payload,
      env: { ...process.env, HOME: tmpHome },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    return err.status;
  }
}

test('heavy + no marker + real git push → BLOCKED (exit 2)', () => {
  assert.strictEqual(runGate('git push origin main'), 2);
});

test('heavy + no marker + real git commit → BLOCKED (exit 2)', () => {
  assert.strictEqual(runGate('git commit -m "wip"'), 2);
});

test('heavy + set-mode --reason "git push" → NOT blocked (exit 0)', () => {
  // The reset command must pass even though its reason text says "git push".
  assert.strictEqual(runGate('node set-mode.js --reset standard --reason "unblock git push"'), 0);
});

test('heavy + non-commit command → NOT blocked (exit 0)', () => {
  assert.strictEqual(runGate('git status'), 0);
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
