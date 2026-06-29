#!/usr/bin/env node
/**
 * Unit tests for lib/hook-output.js (emitAdditionalContext).
 *
 * This is the SSOT emitter used by lesson-nudge / fault-hint / drift-detector to
 * inject text into the model's context from a PostToolUse hook. Verifies the
 * exact JSON envelope shape Claude Code parses, and that empty input is a no-op.
 *
 * Run: node ~/.claude/scripts/hooks/__tests__/hook-output.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { emitAdditionalContext } = require(path.join(__dirname, '..', '..', 'lib', 'hook-output'));

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

// Capture process.stdout.write for the duration of a thunk.
function captureStdout(fn) {
  const orig = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

test('emits valid JSON with the PostToolUse envelope', () => {
  const out = captureStdout(() => emitAdditionalContext('hello world'));
  const parsed = JSON.parse(out); // must be pure JSON
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.strictEqual(parsed.hookSpecificOutput.additionalContext, 'hello world');
});

test('honors a custom hookEventName', () => {
  const out = captureStdout(() => emitAdditionalContext('x', 'UserPromptSubmit'));
  assert.strictEqual(JSON.parse(out).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

test('empty / falsy text is a no-op (nothing written)', () => {
  assert.strictEqual(captureStdout(() => emitAdditionalContext('')), '');
  assert.strictEqual(captureStdout(() => emitAdditionalContext(null)), '');
  assert.strictEqual(captureStdout(() => emitAdditionalContext(undefined)), '');
});

test('stringifies non-string text', () => {
  const out = captureStdout(() => emitAdditionalContext(42));
  assert.strictEqual(JSON.parse(out).hookSpecificOutput.additionalContext, '42');
});

test('output is a single line of pure JSON (no stray passthrough bytes)', () => {
  const out = captureStdout(() => emitAdditionalContext('multi\nline\ntext'));
  // Exactly one JSON object; embedded newlines are escaped inside the string.
  assert.doesNotThrow(() => JSON.parse(out));
  assert.ok(!out.includes('\n') || out.trim().startsWith('{'));
});

console.log(`\nhook-output tests: ${passed} passed, ${failed} failed`);
if (failures.length) { failures.forEach(f => console.log(`  ✗ ${f}`)); process.exit(1); }
process.exit(0);
