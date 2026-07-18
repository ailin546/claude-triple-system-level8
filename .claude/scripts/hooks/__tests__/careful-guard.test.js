#!/usr/bin/env node
/**
 * Unit tests for careful-guard.js v2 (2026-05-09 rewrite).
 *
 * Covers the three classification groups (DENY / CONTEXTUAL / ALLOWLIST)
 * + chain-detection + working-tree-clean integration with `git reset --hard`.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/careful-guard.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const {
  classifyCommand,
  isAllowlisted,
  isSimpleInvocation,
  stripQuotes,
} = require(path.join(__dirname, '..', 'careful-guard.js'));

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

// ─── Setup tmp git repos for tree-aware tests ─────────────────────────

const tmpClean = fs.mkdtempSync(path.join(os.tmpdir(), 'careful-clean-'));
const tmpDirty = fs.mkdtempSync(path.join(os.tmpdir(), 'careful-dirty-'));

function cleanup() {
  for (const dir of [tmpClean, tmpDirty]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

for (const dir of [tmpClean, tmpDirty]) {
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a'), 'x');
  execSync('git add a', { cwd: dir });
  execSync('git commit -q -m init', { cwd: dir });
}
// Dirty: leave an unstaged change
fs.writeFileSync(path.join(tmpDirty, 'a'), 'y');

// ─── Pure helpers ────────────────────────────────────────────────────

test('stripQuotes removes double-quoted strings', () => {
  assert.strictEqual(stripQuotes('echo "rm -rf /"'), 'echo ""');
});

test('stripQuotes removes single-quoted strings', () => {
  assert.strictEqual(stripQuotes("echo 'rm -rf /'"), "echo ''");
});

test('isSimpleInvocation detects chain operators', () => {
  assert.strictEqual(isSimpleInvocation('git pull && rm -rf'), false);
  assert.strictEqual(isSimpleInvocation('git pull; rm -rf'), false);
  assert.strictEqual(isSimpleInvocation('git pull | grep'), false);
  assert.strictEqual(isSimpleInvocation('git pull'), true);
});

test('isSimpleInvocation flags command substitution', () => {
  assert.strictEqual(isSimpleInvocation('rm -rf $(pwd)'), false);
  assert.strictEqual(isSimpleInvocation('rm -rf `pwd`'), false);
});

// ─── Allowlist ───────────────────────────────────────────────────────

test('allowlist: git pull passes', () => {
  assert.strictEqual(isAllowlisted('git pull'), true);
});

test('allowlist: git pull --rebase passes', () => {
  assert.strictEqual(isAllowlisted('git pull --rebase'), true);
});

test('allowlist: ./scripts/pull-all.sh passes', () => {
  assert.strictEqual(isAllowlisted('./scripts/pull-all.sh'), true);
});

test('allowlist: ./restart.sh worker passes', () => {
  assert.strictEqual(isAllowlisted('./restart.sh worker'), true);
});

test('allowlist: cargo build passes', () => {
  assert.strictEqual(isAllowlisted('cargo build --release'), true);
});

test('allowlist: chained command does not pass', () => {
  assert.strictEqual(isAllowlisted('git pull && rm -rf /'), false);
});

// ─── DENY group ──────────────────────────────────────────────────────

test('DENY: fork bomb is blocked', () => {
  const r = classifyCommand(':(){ :|:& };:');
  assert.strictEqual(r.decision, 'block');
});

test('DENY: mkfs is blocked', () => {
  const r = classifyCommand('mkfs.ext4 /dev/sdb1');
  assert.strictEqual(r.decision, 'block');
});

test('DENY: dd to /dev/sda is blocked', () => {
  const r = classifyCommand('dd if=/dev/zero of=/dev/sda bs=1M');
  assert.strictEqual(r.decision, 'block');
});

test('DENY: rm -rf / is blocked', () => {
  const r = classifyCommand('rm -rf /');
  assert.strictEqual(r.decision, 'block');
});

// ─── CONTEXTUAL: git reset --hard ──────────────────────────────────

test('CONTEXTUAL git reset --hard: ambiguous target HEAD~5 blocked', () => {
  const r = classifyCommand('git reset --hard HEAD~5', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /not `origin\/<branch>` form/);
});

test('CONTEXTUAL git reset --hard: sha target blocked', () => {
  const r = classifyCommand('git reset --hard abc123', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL git reset --hard: no target blocked', () => {
  const r = classifyCommand('git reset --hard', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL git reset --hard origin/main: clean tree ALLOWED ★', () => {
  const r = classifyCommand('git reset --hard origin/main', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'allow', `expected allow, got: ${r.reason}`);
});

test('CONTEXTUAL git reset --hard origin/main: dirty tree blocked', () => {
  const r = classifyCommand('git reset --hard origin/main', { cwd: tmpDirty });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /uncommitted changes/);
});

test('CONTEXTUAL git reset --hard origin/dev/branch: nested branch on clean ALLOWED', () => {
  const r = classifyCommand('git reset --hard origin/dev/session-2', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'allow');
});

// ─── CONTEXTUAL: other patterns ────────────────────────────────────

test('CONTEXTUAL: git push --force is blocked', () => {
  const r = classifyCommand('git push origin main --force');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: git push --force-with-lease is allowed', () => {
  const r = classifyCommand('git push --force-with-lease origin main');
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: git push -f (short flag) is blocked', () => {
  const r = classifyCommand('git push -f origin main');
  assert.strictEqual(r.decision, 'block');
});

// ─── Root cause C (2026-06-06): git branch -f must not be read as push -f ──

test('git branch -f main <sha> is allowed (moves local ref, safe) ★', () => {
  const r = classifyCommand('git branch -f main abc1234');
  assert.strictEqual(r.decision, 'allow', `expected allow, got: ${r.reason}`);
});

test('git push && git branch -f does NOT cross-associate the -f flag ★', () => {
  // The reported false positive: `-f` belongs to `git branch`, not the push.
  const r = classifyCommand('git push origin main && git branch -f backup HEAD');
  assert.strictEqual(r.decision, 'allow', `expected allow, got: ${r.reason}`);
});

test('git push --force-with-lease && git branch -f is still allowed', () => {
  const r = classifyCommand('git push --force-with-lease origin main && git branch -f mirror HEAD');
  assert.strictEqual(r.decision, 'allow', `expected allow, got: ${r.reason}`);
});

test('a real force-push in a later segment is still caught', () => {
  // Defense-in-depth: the fix must not let a genuine `git push -f` slip by
  // when it follows another command.
  const r = classifyCommand('git fetch origin && git push --force origin main');
  assert.strictEqual(r.decision, 'block');
});

test('force-push with fd redirection is still blocked (Codex #4) ★', () => {
  // `2>&1` contains an `&` that must NOT stop the force-flag scan — this is a
  // single real force push. The first fix `[^|;&\n]*` wrongly allowed it.
  assert.strictEqual(classifyCommand('git push origin main 2>&1 -f').decision, 'block');
  assert.strictEqual(classifyCommand('git push origin main &>out.log --force').decision, 'block');
});

test('CONTEXTUAL: git restore . on clean tree allowed (no-op)', () => {
  const r = classifyCommand('git restore .', { cwd: tmpClean });
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: git restore . on dirty tree blocked', () => {
  const r = classifyCommand('git restore .', { cwd: tmpDirty });
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: rm -rf /tmp/foo is allowed (safe target)', () => {
  const r = classifyCommand('rm -rf /tmp/foo');
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: rm -rf target/ is allowed (build artifact)', () => {
  const r = classifyCommand('rm -rf target/');
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: rm -rf node_modules is allowed', () => {
  const r = classifyCommand('rm -rf node_modules/');
  assert.strictEqual(r.decision, 'allow');
});

// ── rm -rf 豁免按「路径操作数」判定（2026-07-18 根因修复）──
// 旧实现把豁免写成对整条命令串的**前缀**匹配（`rm -rf ` 后必须紧跟
// target/ 等 token），故绝对路径——真实世界最常见形态——永远走不进豁免。
// 症状是操作员被推向 `/careful off`（关掉全部守卫，比不修更糟）。
test('CONTEXTUAL: rm -rf <绝对路径>/target/debug is allowed (build artifact)', () => {
  const r = classifyCommand('rm -rf /home/ubuntu/celue/quant_base-main/target/debug');
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: rm -rf <绝对路径>/node_modules is allowed', () => {
  const r = classifyCommand('rm -rf /srv/app/frontend/node_modules');
  assert.strictEqual(r.decision, 'allow');
});

test('CONTEXTUAL: 链式命令中的 build-artifact 删除同样放行', () => {
  const r = classifyCommand('df -h / ; rm -rf /home/u/proj/target/debug');
  assert.strictEqual(r.decision, 'allow');
});

// ── 收窄豁免时不得开洞（对抗用例）──
test('CONTEXTUAL: rm -rf "/ target/" — 混合操作数必须全安全才放行', () => {
  // `/` 与 target/ 同为操作数：旧「包含 target/ 即放行」式写法会漏放这条。
  const r = classifyCommand('rm -rf / target/');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: rm -rf 含 .. 逃逸的 target 路径被拦', () => {
  const r = classifyCommand('rm -rf /home/u/proj/target/../..');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: rm -rf 未展开变量 fail-closed', () => {
  const r = classifyCommand('rm -rf $BUILD_DIR');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: rm -rf /tmp 裸目录仍拦（须删 /tmp 下具体项）', () => {
  assert.strictEqual(classifyCommand('rm -rf /tmp').decision, 'block');
  assert.strictEqual(classifyCommand('rm -rf /tmp/build-xyz').decision, 'allow');
});

test('CONTEXTUAL: rm -rf 无操作数被拦', () => {
  const r = classifyCommand('rm -rf');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: rm -rf /etc/foo is blocked', () => {
  const r = classifyCommand('rm -rf /etc/foo');
  assert.strictEqual(r.decision, 'block');
});

test('CONTEXTUAL: bare DROP TABLE blocked', () => {
  const r = classifyCommand('psql < script.sql && DROP TABLE users');
  assert.strictEqual(r.decision, 'block');
});

// ─── ALLOWLIST integration ──────────────────────────────────────────

test('top-level: git pull is allowed', () => {
  const r = classifyCommand('git pull origin main');
  assert.strictEqual(r.decision, 'allow');
});

test('top-level: ./scripts/pull-all.sh is allowed', () => {
  const r = classifyCommand('./scripts/pull-all.sh');
  assert.strictEqual(r.decision, 'allow');
});

test('top-level: ./restart.sh worker is allowed', () => {
  const r = classifyCommand('./restart.sh worker');
  assert.strictEqual(r.decision, 'allow');
});

test('top-level: chained "git pull && rm -rf /" is blocked', () => {
  const r = classifyCommand('git pull && rm -rf /');
  assert.strictEqual(r.decision, 'block');
});

// ─── Empty / safe commands ────────────────────────────────────────

test('empty command allowed', () => {
  const r = classifyCommand('');
  assert.strictEqual(r.decision, 'allow');
});

test('ls is allowed', () => {
  const r = classifyCommand('ls -la');
  assert.strictEqual(r.decision, 'allow');
});

test('echo is allowed', () => {
  const r = classifyCommand('echo hello');
  assert.strictEqual(r.decision, 'allow');
});

// ─── Result ────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.err.stack}`);
  process.exit(1);
}
