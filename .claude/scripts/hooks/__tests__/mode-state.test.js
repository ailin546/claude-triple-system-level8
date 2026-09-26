'use strict';
// Task mode, escalation state and the set-mode cooldown belong to one session
// (lib/mode-check.js): concurrent sessions in one project must not reset or
// escalate each other, and resume / /compact keep a session's mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '..');
const LIB = path.resolve(__dirname, '../../lib');
const SETTINGS = path.resolve(__dirname, '../../../settings.json');
const A = 'aaaa1111-2222-3333-4444-555566667777';
const B = 'bbbb1111-2222-3333-4444-555566667777';
const C = 'cccc1111-2222-3333-4444-555566667777';

function withSandbox(fn) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mode-state-test-')));
  const s = { root, home: path.join(root, 'home'), project: path.join(root, 'project') };
  fs.mkdirSync(path.join(s.home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(s.project, '.claude'), { recursive: true });
  try {
    fn(s);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Only the session named here is visible to the child process.
function envFor(s, session) {
  const env = { ...process.env, HOME: s.home, CLAUDE_PROJECT_ROOT: s.project };
  for (const k of ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID']) delete env[k];
  if (session) env.CLAUDE_CODE_SESSION_ID = session;
  return env;
}

function run(s, script, { session, input, args = [] } = {}) {
  return spawnSync(process.execPath, [path.join(HOOKS, script), ...args], {
    cwd: s.project, input: input === undefined ? '' : JSON.stringify(input), encoding: 'utf8', env: envFor(s, session),
  });
}

function modeOf(s, session) {
  const r = spawnSync(process.execPath,
    ['-e', `process.stdout.write(require(${JSON.stringify(path.join(LIB, 'mode-check.js'))}).getCurrentMode())`],
    { cwd: s.project, encoding: 'utf8', env: envFor(s, session) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const startSession = (s, id, source = 'startup') => run(s, 'task-router.js', { session: id, input: { session_id: id, source } });
const setMode = (s, id, ...args) => run(s, 'set-mode.js', { session: id, args });
const edit = (s, id, file) => run(s, 'pre-tool-escalate.js', {
  session: id, input: { session_id: id, tool_name: 'Edit', tool_input: { file_path: file } },
});
const RESET = ['--reset', '--reason', 'switching to an unrelated task'];

test("a session starting does not reset another session's mode", () => withSandbox((s) => {
  startSession(s, A);
  assert.equal(setMode(s, A, 'heavy').status, 0);
  startSession(s, B);
  assert.equal(modeOf(s, A), 'heavy');
  assert.equal(modeOf(s, B), 'fast');
}));

test('resume and /compact keep the mode; a new session and /clear start from fast', () => withSandbox((s) => {
  startSession(s, A);
  setMode(s, A, 'heavy');
  assert.match(startSession(s, A, 'compact').stdout, /Mode: Heavy \(kept after compact\)/);
  assert.equal(modeOf(s, A), 'heavy');
  startSession(s, A, 'resume');
  assert.equal(modeOf(s, A), 'heavy');
  startSession(s, A, 'clear');
  assert.equal(modeOf(s, A), 'fast');
}));

test('escalation keeps accumulating across /compact', () => withSandbox((s) => {
  startSession(s, A);
  edit(s, A, '/w/alpha.ts');
  edit(s, A, '/w/beta.ts');
  startSession(s, A, 'compact');
  edit(s, A, '/w/gamma.ts');
  assert.equal(modeOf(s, A), 'standard');
}));

test('escalation accumulates per session', () => withSandbox((s) => {
  startSession(s, A);
  startSession(s, B);
  edit(s, A, '/w/alpha.ts');
  edit(s, A, '/w/beta.ts');
  edit(s, B, '/w/gamma.ts');
  assert.equal(modeOf(s, A), 'fast', "another session's files must not count");
  edit(s, A, '/w/delta.ts');
  assert.equal(modeOf(s, A), 'standard');
  assert.equal(modeOf(s, B), 'fast');
}));

test('the set-mode reset cooldown is per session', () => withSandbox((s) => {
  startSession(s, A);
  startSession(s, B);
  setMode(s, A, 'heavy');
  assert.equal(setMode(s, A, ...RESET).status, 0);
  setMode(s, B, 'heavy');
  assert.equal(setMode(s, B, ...RESET).status, 0, "another session's reset must not block this one");
  setMode(s, A, 'heavy');
  assert.equal(setMode(s, A, ...RESET).status, 2, 'a second reset in one session within the cooldown is blocked');
}));

test("a hook gates on its own session's mode", () => withSandbox((s) => {
  startSession(s, A);
  startSession(s, B);
  setMode(s, A, 'standard');
  for (const id of [A, B]) {
    run(s, 'drift-detector.js', { session: id, input: { session_id: id, tool_name: 'Edit', tool_input: { file_path: '/w/alpha.ts' } } });
  }
  assert.deepEqual(fs.readdirSync(path.join(s.project, '.claude', '.drift-state')), [`${A}.json`]);
}));

test('without a session id the project-level files are used', () => withSandbox((s) => {
  assert.equal(setMode(s, null, 'heavy').status, 0);
  assert.equal(fs.readFileSync(path.join(s.project, '.claude', '.task-mode'), 'utf8').trim(), 'heavy');
  assert.ok(!fs.existsSync(path.join(s.project, '.claude', '.mode-state')));
}));

test('a session without its own mode inherits the project-level one, then keeps its own', () => withSandbox((s) => {
  const shared = path.join(s.project, '.claude', '.task-mode');
  fs.writeFileSync(shared, 'standard');
  assert.equal(modeOf(s, A), 'standard');
  startSession(s, A, 'compact');
  fs.writeFileSync(shared, 'heavy');
  assert.equal(modeOf(s, A), 'standard', 'after its first write the session no longer follows the shared file');
}));

test('task-router warns when the hook input and the environment name different sessions', () => withSandbox((s) => {
  assert.match(run(s, 'task-router.js', { session: A, input: { session_id: B, source: 'startup' } }).stdout, /WARNING: .*not per session/);
  assert.match(run(s, 'task-router.js', { session: null, input: { session_id: A, source: 'startup' } }).stdout, /CLAUDE_CODE_SESSION_ID is unset/);
  assert.doesNotMatch(startSession(s, A).stdout, /WARNING/);
}));

test("a new session's first write prunes sessions idle for a week", () => withSandbox((s) => {
  const dir = path.join(s.project, '.claude', '.mode-state');
  fs.mkdirSync(dir, { recursive: true });
  const weekAgo = Date.now() / 1000 - 8 * 24 * 60 * 60;
  for (const f of ['gone.mode', 'gone.escalation.json', 'live.mode']) {
    fs.writeFileSync(path.join(dir, f), 'fast');
    fs.utimesSync(path.join(dir, f), weekAgo, weekAgo);
  }
  fs.writeFileSync(path.join(dir, 'live.escalation.json'), '{}'); // live refreshed it recently
  startSession(s, C);
  assert.deepEqual(new Set(fs.readdirSync(dir)), new Set([`${C}.mode`, 'live.mode', 'live.escalation.json']));
}));

test("trace rows name their session and mode-explain lists only this session's changes", () => withSandbox((s) => {
  startSession(s, A);
  startSession(s, B);
  setMode(s, A, 'heavy');
  setMode(s, B, 'standard');
  const rows = fs.readFileSync(path.join(s.project, '.claude', 'logs', 'mode-trace.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(rows.length >= 4 && rows.every((r) => r.session_id === A || r.session_id === B));
  const explained = run(s, 'mode-explain.js', { session: A, args: ['--all'] }).stdout;
  assert.match(explained, /Current mode: heavy/);
  assert.match(explained, /→ heavy/);
  assert.doesNotMatch(explained, /→ standard/, "another session's change leaked into this session's history");
}));

test('registered hooks and libs reach mode state only through mode-check', () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  const files = new Set();
  for (const groups of Object.values(settings.hooks || {})) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        const m = /scripts\/hooks\/([\w-]+\.js)/.exec(hook.command || '');
        if (m) files.add(path.join(HOOKS, m[1]));
      }
    }
  }
  for (const f of fs.readdirSync(LIB)) if (f.endsWith('.js') && f !== 'mode-check.js') files.add(path.join(LIB, f));
  const offenders = [...files].filter((file) => fs.existsSync(file)
    && /['"`](\.task-mode|\.escalation-state\.json|set-mode-cooldown\.json|\.mode-state)['"`]/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.basename(f)), []);
});
