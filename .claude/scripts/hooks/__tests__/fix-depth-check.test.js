#!/usr/bin/env node
/**
 * Unit tests for fix-depth-check.js.
 *
 * Covers Codex 5-class "必测 hook" boundary "解析配置/内容" — regex pattern
 * matching + commit message extraction. Companion to:
 *   - careful-guard.test.js (阻断 + 改 context)
 *   - evaluation-gate.test.js (state file + mode gate + 阻断)
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/fix-depth-check.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 *
 * 2026-05-20 M4 hook test 标杆: 沿 careful-guard 零依赖测试模式
 *   (assert + node 直接 require + 无 jest/mocha 框架).
 */

'use strict';

const assert = require('assert');
const path = require('path');

const {
  FIX_INDICATORS,
  FIX_INDICATORS_CN,
  ROOT_CAUSE_INDICATORS,
  extractCommitMessage,
} = require(path.join(__dirname, '..', 'fix-depth-check.js'));

let pass = 0, fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    fail++;
    failures.push({ name, err });
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
  }
}

// ── FIX_INDICATORS (English) ─────────────────────────
process.stdout.write('FIX_INDICATORS (EN):\n');
t('matches "fix"',         () => assert(FIX_INDICATORS.test('fix the bug')));
t('matches "fixes"',       () => assert(FIX_INDICATORS.test('fixes #123')));
t('matches "fixed"',       () => assert(FIX_INDICATORS.test('fixed a regression')));
t('matches "hotfix"',      () => assert(FIX_INDICATORS.test('hotfix: race condition')));
t('matches "bugfix"',      () => assert(FIX_INDICATORS.test('bugfix for #42')));
t('matches "patch"',       () => assert(FIX_INDICATORS.test('patch the null deref')));
t('NO match: "prefix"',    () => assert(!FIX_INDICATORS.test('prefix string handling')));
t('NO match: "fixate"',    () => assert(!FIX_INDICATORS.test('fixate gaze')));

// ── FIX_INDICATORS_CN (Chinese) ──────────────────────
process.stdout.write('\nFIX_INDICATORS_CN (CN):\n');
t('matches "修复"',         () => assert(FIX_INDICATORS_CN.test('修复 commit 漂移')));
t('matches "修一下"',       () => assert(FIX_INDICATORS_CN.test('修一下 hook 逻辑')));
t('matches "修了"',         () => assert(FIX_INDICATORS_CN.test('修了 8 处锚点')));
t('NO match: "修养"',       () => assert(!FIX_INDICATORS_CN.test('提高代码修养')));
t('NO match: "修整"',       () => assert(!FIX_INDICATORS_CN.test('重新修整文档')));

// ── ROOT_CAUSE_INDICATORS ────────────────────────────
process.stdout.write('\nROOT_CAUSE_INDICATORS:\n');
t('matches "root cause"',  () => assert(ROOT_CAUSE_INDICATORS.test('root cause: race in stash pop')));
t('matches "根因"',         () => assert(ROOT_CAUSE_INDICATORS.test('根因是 hook 未做 cwd 检查')));
t('matches "because"',     () => assert(ROOT_CAUSE_INDICATORS.test('fix because mode gate was wrong')));
t('matches "caused by"',   () => assert(ROOT_CAUSE_INDICATORS.test('caused by race condition')));
t('matches "due to"',      () => assert(ROOT_CAUSE_INDICATORS.test('failure due to missing index')));
t('matches "原因"',         () => assert(ROOT_CAUSE_INDICATORS.test('失败原因是 marker schema')));
t('matches "introduced by"', () => assert(ROOT_CAUSE_INDICATORS.test('regression introduced by commit abc')));
t('NO match: bare fix msg',() => assert(!ROOT_CAUSE_INDICATORS.test('fix typo in README')));

// ── extractCommitMessage (-m form) ───────────────────
process.stdout.write('\nextractCommitMessage (-m form):\n');
t('extracts -m "..." (double)', () => assert.strictEqual(
  extractCommitMessage('git commit -m "fix: typo"'), 'fix: typo'));
t('extracts -m \'...\' (single)', () => assert.strictEqual(
  extractCommitMessage("git commit -m 'fix: typo'"), 'fix: typo'));
t('extracts with extra flags', () => assert.strictEqual(
  extractCommitMessage('git commit --no-verify -m "fix race" --signoff'), 'fix race'));
t('returns null on no commit', () => assert.strictEqual(
  extractCommitMessage('git push origin main'), null));

// ── extractCommitMessage (HEREDOC form) ──────────────
process.stdout.write('\nextractCommitMessage (HEREDOC form):\n');
t('extracts HEREDOC body', () => {
  const cmd = "git commit -m \"$(cat <<'EOF'\nfix: race\n\nroot cause: ...\nEOF\n)\"";
  const msg = extractCommitMessage(cmd);
  assert(msg && msg.includes('root cause'), `got: ${JSON.stringify(msg)}`);
});
t('HEREDOC without quotes around EOF', () => {
  const cmd = 'git commit -m "$(cat <<EOF\nbugfix\nbecause X\nEOF\n)"';
  const msg = extractCommitMessage(cmd);
  assert(msg && msg.includes('because'), `got: ${JSON.stringify(msg)}`);
});

// ── End-to-end behavior simulation (integration-level) ─
process.stdout.write('\nIntegration (fix indicator + RC absence = warn):\n');
t('symptom-only "fix typo" should warn (no RC marker)', () => {
  const msg = 'fix typo';
  const fixHit = FIX_INDICATORS.test(msg) || FIX_INDICATORS_CN.test(msg);
  const rcHit  = ROOT_CAUSE_INDICATORS.test(msg);
  assert(fixHit && !rcHit, 'should match fix and lack RC');
});
t('root-cause "fix race because deadlock" should pass', () => {
  const msg = 'fix race condition because send/recv deadlock';
  const fixHit = FIX_INDICATORS.test(msg) || FIX_INDICATORS_CN.test(msg);
  const rcHit  = ROOT_CAUSE_INDICATORS.test(msg);
  assert(fixHit && rcHit, 'should match both');
});
t('feat with "fix" word: 修复 X (no RC) warns', () => {
  const msg = '修复 commit message extraction';
  const fixHit = FIX_INDICATORS.test(msg) || FIX_INDICATORS_CN.test(msg);
  const rcHit  = ROOT_CAUSE_INDICATORS.test(msg);
  assert(fixHit && !rcHit);
});
t('hotfix with explicit RC reference passes', () => {
  const msg = 'hotfix: marker forgery — root cause: schema validation missing';
  assert(FIX_INDICATORS.test(msg) && ROOT_CAUSE_INDICATORS.test(msg));
});

// ── Summary ─────────────────────────────────────────
process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
if (fail > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  • ${f.name}\n`);
  process.exit(1);
}
process.exit(0);
