'use strict';
// Which session a hook acts for: `session_id` from the hook's stdin JSON
// (lib/utils.js::hookSessionId). Claude Code does not set CLAUDE_SESSION_ID;
// every case sets it to a decoy to prove it is ignored.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '..');
const { hookSessionId } = require(path.resolve(__dirname, '../../lib/utils.js'));

// A sandbox HOME and a project in standard mode (for the mode-gated hooks).
function sandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'session-id-test-')));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(home, '.claude', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude', '.task-mode'), 'standard');
  return { root, home, project, sessions: path.join(home, '.claude', 'sessions') };
}

function withSandbox(fn) {
  const s = sandbox();
  try {
    fn(s);
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
}

function runHook(s, hook, input, extraEnv = {}) {
  const env = { ...process.env, HOME: s.home, CLAUDE_PROJECT_ROOT: s.project, CLAUDE_SESSION_ID: 'decoy-env-id', ...extraEnv };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    cwd: s.project, input: JSON.stringify(input), encoding: 'utf8', env,
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
}

const A = 'aaaa1111-2222-3333-4444-555566667777';
const B = 'bbbb1111-2222-3333-4444-555566667777';

test('hookSessionId reads the hook input only, made safe for file names', () => {
  const saved = process.env.CLAUDE_SESSION_ID;
  process.env.CLAUDE_SESSION_ID = 'decoy-env-id';
  try {
    assert.equal(hookSessionId({ session_id: A }), A);
    assert.equal(hookSessionId({}), '');
    assert.equal(hookSessionId(null), '');
    assert.equal(hookSessionId({ session_id: '../x y' }), 'xy');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = saved;
  }
});

test('session-end keeps one file per session across Stops, and one per session', () => withSandbox((s) => {
  runHook(s, 'session-end.js', { session_id: A });
  runHook(s, 'session-end.js', { session_id: A });
  runHook(s, 'session-end.js', { session_id: B });
  const files = fs.readdirSync(s.sessions).sort();
  assert.equal(files.length, 2, files.join(','));
  assert.ok(files[0].endsWith(`-${A.slice(0, 8)}-session.tmp`), files[0]);
  assert.ok(files[1].endsWith(`-${B.slice(0, 8)}-session.tmp`), files[1]);
}));

test('session-end records nothing without a session id', () => withSandbox((s) => {
  runHook(s, 'session-end.js', {});
  assert.deepEqual(fs.readdirSync(s.sessions), []);
}));

function writeSessionFile(s, id, project, task, mtimeSec) {
  const file = path.join(s.sessions, `2026-09-26-${id.slice(0, 8)}-session.tmp`);
  fs.writeFileSync(file, [
    '# Session: 2026-09-26', '**Date:** 2026-09-26', `**Project:** ${project}`, '**Branch:** main', '',
    '---', '<!-- ECC:SUMMARY:START -->', '## Session Summary', '', '### Tasks', `- ${task}`, '',
  ].join('\n'));
  fs.utimesSync(file, mtimeSec, mtimeSec);
}

test("session-start resumes only its own session's summary", () => withSandbox((s) => {
  const now = Date.now() / 1000;
  writeSessionFile(s, A, 'project-a', 'task of session A', now - 60);
  writeSessionFile(s, B, 'project-b', 'task of session B', now); // newest: must still not leak
  const own = runHook(s, 'session-start.js', { session_id: A, source: 'compact' }).stdout;
  assert.ok(own.includes('## Session Resume'), own.slice(0, 400));
  assert.ok(own.includes('- **Project:** project-a'), 'the goal line names the project, not the date heading');
  assert.ok(own.includes('task of session A'));
  assert.ok(!own.includes('session B') && !own.includes('project-b'), "another session's summary leaked");
  const fresh = runHook(s, 'session-start.js', { session_id: 'cccc1111-new-session', source: 'startup' }).stdout;
  assert.ok(!fresh.includes('## Session Resume'), 'a new session gets no other session injected');
}));

test('suggest-compact counts tool calls per session', () => withSandbox((s) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const a = `sessa-${suffix}`;
  const b = `sessb-${suffix}`;
  try {
    const env = { COMPACT_THRESHOLD: '2' };
    runHook(s, 'suggest-compact.js', { session_id: a }, env);
    const second = runHook(s, 'suggest-compact.js', { session_id: a }, env);
    assert.match(second.stderr, /2 tool calls reached/);
    const other = runHook(s, 'suggest-compact.js', { session_id: b }, env);
    assert.doesNotMatch(other.stderr, /tool calls reached/, "another session's calls must not count");
  } finally {
    for (const id of [a, b]) fs.rmSync(path.join(os.tmpdir(), `claude-tool-count-${id}`), { force: true });
  }
}));
