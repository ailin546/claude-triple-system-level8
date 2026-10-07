'use strict';
// Which session a hook acts for (lib/utils.js::hookSessionId): `session_id`
// from the hook's stdin JSON, else CLAUDE_CODE_SESSION_ID. Claude Code never
// sets CLAUDE_SESSION_ID; every case sets it to a decoy to prove it is ignored.
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
  // Production parity: CLAUDE_CODE_SESSION_ID names the same session as the input.
  if (input.session_id) env.CLAUDE_CODE_SESSION_ID = input.session_id;
  else delete env.CLAUDE_CODE_SESSION_ID;
  const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    cwd: s.project, input: JSON.stringify(input), encoding: 'utf8', env,
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
}

const A = 'aaaa1111-2222-3333-4444-555566667777';
const B = 'bbbb1111-2222-3333-4444-555566667777';

test('hookSessionId: the hook input, else CLAUDE_CODE_SESSION_ID, made safe for file names', () => {
  const saved = { legacy: process.env.CLAUDE_SESSION_ID, code: process.env.CLAUDE_CODE_SESSION_ID };
  process.env.CLAUDE_SESSION_ID = 'decoy-env-id';
  try {
    delete process.env.CLAUDE_CODE_SESSION_ID;
    assert.equal(hookSessionId({ session_id: A }), A);
    assert.equal(hookSessionId({}), '', 'CLAUDE_SESSION_ID is never a source');
    assert.equal(hookSessionId(null), '');
    assert.equal(hookSessionId({ session_id: '../x y' }), 'xy');
    process.env.CLAUDE_CODE_SESSION_ID = B;
    assert.equal(hookSessionId(null), B, 'a script run through Bash has only the environment');
    assert.equal(hookSessionId({ session_id: A }), A, 'the hook input wins');
  } finally {
    for (const [k, v] of [['CLAUDE_SESSION_ID', saved.legacy], ['CLAUDE_CODE_SESSION_ID', saved.code]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
