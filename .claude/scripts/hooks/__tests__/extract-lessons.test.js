#!/usr/bin/env node
/**
 * Unit tests for lib/extract-lessons.js: filterNewCommits() and the
 * record-once guarantees of extractFromTranscript().
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

const {
  filterNewCommits,
  extractFromTranscript,
  loadSeenLessonKeys,
  saveSeenLessonKeys,
  lessonKey,
  SEEN_TTL_MS,
} = require(path.join(__dirname, '..', '..', 'lib', 'extract-lessons.js'));

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

// ── extractFromTranscript: nothing is recorded twice ──

const NOW = Date.parse('2026-09-26T03:10:00Z');
const DAY = 24 * 60 * 60 * 1000;
const LESSON_A = '- 旧消息被原样追加回长会话记录 → 按消息时间门控而不是只靠会过期的 key';
const LESSON_B = '- 新会话里写下的教训要照常提取 → 门控只挡比 key 寿命更老的消息';
const DECISION = '- 决策也要跨回合去重，否则每次 Stop 都重记一遍';

function assistantAt(ms, uuid, text) {
  return { type: 'assistant', uuid, timestamp: new Date(ms).toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text }] } };
}

function tmpTranscript(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-lessons-transcript-'));
  const p = path.join(dir, 'session.jsonl');
  fs.writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  return p;
}

// 11. A message older than a seen key's lifetime is not extracted, however it
//     reappears (here: original plus a re-appended copy with the same uuid).
test('old message and its re-appended copy are not extracted again', () => {
  const old = NOW - 11 * DAY;
  const p = tmpTranscript([
    assistantAt(old, 'u-old', `**Lessons:**\n${LESSON_A}`),
    assistantAt(NOW - 60 * 1000, 'u-new', `**Lessons:**\n${LESSON_B}`),
    assistantAt(old, 'u-old', `**Lessons:**\n${LESSON_A}`),
  ]);
  const r = extractFromTranscript(p, new Set(), NOW);
  assert.deepStrictEqual(r.lessons, [LESSON_B.slice(2)]);
});

// 12. Exactly at the lifetime the key has expired, so the message must be skipped.
test('message exactly one seen-key lifetime old is skipped', () => {
  const p = tmpTranscript([assistantAt(NOW - SEEN_TTL_MS, 'u-edge', `**Lessons:**\n${LESSON_A}`)]);
  assert.deepStrictEqual(extractFromTranscript(p, new Set(), NOW).lessons, []);
});

// 13. Decisions round-trip through the seen-key store like lessons do.
test('decisions are not re-extracted once their keys are saved', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-lessons-state-'));
  const p = tmpTranscript([assistantAt(Date.now() - 60 * 1000, 'u-d', `**Decisions:**\n${DECISION}`)]);
  const first = extractFromTranscript(p, loadSeenLessonKeys(state));
  assert.deepStrictEqual(first.decisions, [DECISION.slice(2)]);
  saveSeenLessonKeys(state, first.keys);
  assert.deepStrictEqual(extractFromTranscript(p, loadSeenLessonKeys(state)).decisions, []);
});

// 14. Lessons round-trip too, through the keys the extraction hands back.
test('lessons are not re-extracted once their keys are saved', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-lessons-state-'));
  const p = tmpTranscript([assistantAt(Date.now() - 60 * 1000, 'u-l', `**Lessons:**\n${LESSON_B}`)]);
  const first = extractFromTranscript(p, loadSeenLessonKeys(state));
  assert.strictEqual(first.lessons.length, 1);
  saveSeenLessonKeys(state, first.keys);
  assert.deepStrictEqual(extractFromTranscript(p, loadSeenLessonKeys(state)).lessons, []);
});

// 15. Every writer extracts through the library and persists the keys it returns.
test('stop-summary, periodic-memory and pre-compact share the extractor and its keys', () => {
  for (const f of ['stop-summary.js', 'periodic-memory.js', 'pre-compact.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(/extractFromTranscript\(/.test(src), `${f} does not use extractFromTranscript`);
    assert.ok(!/isLessonsHdr/.test(src), `${f} carries its own transcript parser`);
    // A call statement, not the wrapper stop-summary defines around the library.
    const persistsKeys = /^\s*(?:if \([^)]*\)\s*)?(?:\w+\.)?saveSeenLessonKeys\((?:[\w.]+,\s*)?keys\);/m;
    assert.ok(persistsKeys.test(src), `${f} does not persist the extraction's keys`);
  }
});

// ── lessonKey: the problem side, split at the separator arrow only ──

const WEEKLY_A = 'weekly→long-term 只沉淀 lessons 和 decisions，流水账丢弃';
const WEEKLY_B = 'weekly→long-term 沉淀只保留 lessons 和 decisions → 流水账（安装了 X）丢弃';

// 16. An arrow inside a term is part of the problem, not the separator.
test('an arrow inside a term does not split the key', () => {
  assert.strictEqual(lessonKey(WEEKLY_B), 'weekly→long-term 沉淀只保留 lessons 和 decisions');
  assert.strictEqual(lessonKey('db json->sqlite 迁移漏字段 → 用业务 id 做主键'), 'db json->sqlite 迁移漏字段');
  assert.notStrictEqual(lessonKey(WEEKLY_A), lessonKey(WEEKLY_B));
});

// 17. With no separator at all, the whole text identifies the lesson.
test('a lesson whose only arrows sit inside terms is keyed by its whole text', () => {
  assert.strictEqual(lessonKey(WEEKLY_A), WEEKLY_A.toLowerCase());
});

// 18. Separators keep working: spaced, CJK-adjacent, mixed, multi-part, leading.
test('plain, spaced and CJK-adjacent arrows still separate problem from fix', () => {
  assert.strictEqual(lessonKey('问题描述→正确做法'), '问题描述');
  assert.strictEqual(lessonKey('Problem Here -> Fix'), 'problem here');
  assert.strictEqual(lessonKey('缓存命中率下降→add warmup'), '缓存命中率下降');
  assert.strictEqual(lessonKey('retry storm→ 加退避'), 'retry storm');
  assert.strictEqual(lessonKey('原因 → 后果 → 做法'), '原因');
  assert.strictEqual(lessonKey('→ 开头的箭头 → 做法'), '→ 开头的箭头');
});

// 19. The dedup semantics stay: one problem, differently phrased fixes → one key.
test('the same problem with a different fix still shares a key', () => {
  assert.strictEqual(lessonKey('同一个问题 → 做法甲'), lessonKey('同一个问题 → 做法乙'));
});

// 20. Consequence at extraction: both lessons survive the in-run dedup.
test('two lessons that differ only after an embedded arrow are both extracted', () => {
  const p = tmpTranscript([assistantAt(Date.now() - 60 * 1000, 'u-w',
    `**Lessons:**\n- ${WEEKLY_B}\n- weekly→long-term 同步前先去重 → 否则重复条目进 long-term`)]);
  assert.strictEqual(extractFromTranscript(p, new Set()).lessons.length, 2);
});

// Report
console.log(`\nextract-lessons tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
process.exit(0);
