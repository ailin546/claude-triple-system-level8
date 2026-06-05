#!/usr/bin/env node
/**
 * Unit tests for lesson-nudge.js.
 *
 * Categories (per hooks/__tests__/README.md): state file (lesson-nudge.json
 * throttle), 改 context (stderr nudge), 解析配置 (commit msg + transcript
 * regex). All must be tested.
 *
 * Pure-function tests run in-process. End-to-end tests spawn the hook with a
 * temp HOME so the throttle state file never touches the real ~/.claude.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/lesson-nudge.test.js
 * Exit 0 = all pass, exit 1 = any failure.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'lesson-nudge.js');
const { LESSON_WORTHY, LESSON_WORTHY_CN, transcriptHasLessons } = require(HOOK_PATH);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-tx-'));
  const p = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function runHook({ command = 'git commit -m "fix: x"', tool = 'Bash', transcript = null, home = null }) {
  const tmpHome = home || fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-home-'));
  const stdin = JSON.stringify({ tool_name: tool, tool_input: { command }, transcript_path: transcript });
  const r = spawnSync('node', [HOOK_PATH], { input: stdin, env: { ...process.env, HOME: tmpHome }, encoding: 'utf8' });
  return { stderr: r.stderr || '', stdout: r.stdout || '', status: r.status, home: tmpHome };
}

// ── Pure: LESSON_WORTHY ──
test('LESSON_WORTHY matches fix/perf/refactor/revert/hotfix/patch', () => {
  for (const m of ['fix: a', 'fixed b', 'perf: c', 'refactor: d', 'revert: e', 'hotfix x', 'patch y']) {
    assert.ok(LESSON_WORTHY.test(m), `should match: ${m}`);
  }
});

test('LESSON_WORTHY rejects feat/docs/chore', () => {
  for (const m of ['feat: a', 'docs: b', 'chore: c', 'test: d', 'style: e']) {
    assert.ok(!LESSON_WORTHY.test(m), `should not match: ${m}`);
  }
});

test('LESSON_WORTHY_CN matches 修复/重构/回滚/优化', () => {
  for (const m of ['修复了空指针', '重构余额模块', '回滚 M-101', '优化热路径']) {
    assert.ok(LESSON_WORTHY_CN.test(m), `should match: ${m}`);
  }
});

// ── Pure: transcriptHasLessons ──
test('transcriptHasLessons detects line-start Lessons header', () => {
  // JSONL text escapes real newline as backslash-n; header is \n**Lessons:**
  const p = tmpFile('{"type":"assistant","message":{"content":[{"type":"text","text":"code\\n**Lessons:**\\n- x -> y"}]}}');
  assert.ok(transcriptHasLessons(p));
});

test('transcriptHasLessons ignores prose mention (no newline prefix)', () => {
  const p = tmpFile('{"text":"please write a **Lessons:** section below"}');
  assert.ok(!transcriptHasLessons(p));
});

test('transcriptHasLessons false on missing file', () => {
  assert.strictEqual(transcriptHasLessons('/no/such/transcript.jsonl'), false);
});

// ── E2E: nudge fires ──
test('E2E: fix commit + no-lessons transcript → nudge fires', () => {
  const tp = tmpFile('{"type":"assistant","message":{"content":[{"type":"text","text":"just code, no lessons"}]}}');
  const r = runHook({ command: 'git commit -m "fix: foo"', transcript: tp });
  assert.ok(r.stderr.includes('[LessonNudge]'), `stderr was: ${r.stderr}`);
});

// ── E2E: nudge suppressed ──
test('E2E: feat commit → no nudge', () => {
  const tp = tmpFile('no lessons');
  const r = runHook({ command: 'git commit -m "feat: foo"', transcript: tp });
  assert.ok(!r.stderr.includes('[LessonNudge]'));
});

test('E2E: non-Bash tool → no nudge', () => {
  const r = runHook({ tool: 'Edit', command: 'irrelevant' });
  assert.ok(!r.stderr.includes('[LessonNudge]'));
});

test('E2E: non-commit Bash → no nudge', () => {
  const r = runHook({ command: 'git status' });
  assert.ok(!r.stderr.includes('[LessonNudge]'));
});

test('E2E: transcript already has lessons → no nudge', () => {
  const tp = tmpFile('{"text":"x\\n**Lessons:**\\n- a -> b"}');
  const r = runHook({ command: 'git commit -m "fix: foo"', transcript: tp });
  assert.ok(!r.stderr.includes('[LessonNudge]'));
});

// ── E2E: throttle (state file) ──
test('E2E: throttle — second run same transcript+home → no nudge', () => {
  const tp = tmpFile('{"text":"no lessons at all here"}');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-home-'));
  const r1 = runHook({ command: 'git commit -m "fix: a"', transcript: tp, home });
  assert.ok(r1.stderr.includes('[LessonNudge]'), 'first run should nudge');
  const r2 = runHook({ command: 'git commit -m "fix: b"', transcript: tp, home });
  assert.ok(!r2.stderr.includes('[LessonNudge]'), 'second run should be throttled');
  // state file written under temp home
  assert.ok(fs.existsSync(path.join(home, '.claude', '.session-state', 'lesson-nudge.json')));
});

// Report
console.log(`\nlesson-nudge tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
process.exit(0);
