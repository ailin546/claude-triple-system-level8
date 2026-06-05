#!/usr/bin/env node
/**
 * Unit tests for lib/extract-lessons.js filterNewCommits().
 *
 * filterNewCommits is a regex parser over today.md content (解析配置/内容
 * category per hooks/__tests__/README.md). A parser bug means either dup
 * bloat (miss a recorded commit) or lost commits (false-match prose). The
 * anchor regex `^\s*-\s+`([0-9a-f]{7,40})\s` must only match real commit
 * bullet lines, never inline code or prose mentions. Must be tested.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/extract-lessons.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { filterNewCommits } = require(path.join(__dirname, '..', '..', 'lib', 'extract-lessons.js'));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

// Write a temp today.md, return its path.
function tmpToday(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-lessons-test-'));
  const p = path.join(dir, 'today.md');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const COMMITS = ['abc1234 fix: foo', 'def5678 feat: bar', '9990000 docs: baz'];

// 1. empty input
test('empty commits returns empty', () => {
  assert.deepStrictEqual(filterNewCommits([], '/nonexistent'), []);
});

// 2. missing today.md → no filtering
test('missing today.md returns all commits', () => {
  assert.deepStrictEqual(filterNewCommits(COMMITS, '/no/such/today.md'), COMMITS);
});

// 3. empty today.md → no filtering
test('empty today.md returns all commits', () => {
  assert.deepStrictEqual(filterNewCommits(COMMITS, tmpToday('')), COMMITS);
});

// 4. one commit already recorded → only that one dropped
test('filters out commit already in today.md', () => {
  const p = tmpToday('# Today\n\n**Commits:**\n- `abc1234 fix: foo`\n');
  assert.deepStrictEqual(filterNewCommits(COMMITS, p), ['def5678 feat: bar', '9990000 docs: baz']);
});

// 5. all recorded → empty (the core multi-trigger dedup case)
test('all commits present returns empty', () => {
  const p = tmpToday('- `abc1234 x`\n- `def5678 y`\n- `9990000 z`\n');
  assert.deepStrictEqual(filterNewCommits(COMMITS, p), []);
});

// 6. **Fixes:** section (with body quote lines) also matched
test('matches commits in Fixes section with body', () => {
  const p = tmpToday('**Fixes:**\n- `abc1234 fix: foo`\n  > root cause: x\n');
  const r = filterNewCommits(COMMITS, p);
  assert.ok(!r.includes('abc1234 fix: foo'));
  assert.strictEqual(r.length, 2);
});

// 7. inline code in a lesson must NOT be mistaken for a commit hash
test('inline code in lessons not mistaken for commit hash', () => {
  const p = tmpToday('**Lessons:**\n- 用 `Price` 不要 `f64` → 定点数\n');
  assert.deepStrictEqual(filterNewCommits(COMMITS, p), COMMITS);
});

// 8. a hash mentioned in lesson PROSE (not a `- `hash`` bullet) must NOT count
//    as recorded — this is exactly what the bullet+backtick anchor protects.
test('commit hash in lesson prose not treated as recorded', () => {
  const p = tmpToday('**Lessons:**\n- commit abc1234 引入了 bug → 回滚\n');
  const r = filterNewCommits(COMMITS, p);
  assert.ok(r.includes('abc1234 fix: foo'), 'prose mention must not filter the commit');
});

// 9. non-array input returned as-is (defensive)
test('non-array commits returned as-is', () => {
  assert.strictEqual(filterNewCommits(null, '/x'), null);
});

// 10. 7-char hash boundary (minimum git short hash)
test('7-char hash boundary matches', () => {
  const p = tmpToday('- `1234567 msg`\n');
  assert.deepStrictEqual(filterNewCommits(['1234567 msg', 'aaaaaaa other'], p), ['aaaaaaa other']);
});

// Report
console.log(`\nfilterNewCommits tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
process.exit(0);
