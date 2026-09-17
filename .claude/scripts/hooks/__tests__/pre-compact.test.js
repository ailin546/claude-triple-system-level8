'use strict';
// Covers: state file (writes .memory/today.md) + content parsing (commit dedupe).
// Hermetic — throwaway HOME + throwaway project root, never touches the real repos.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../pre-compact.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-compact-test-'));
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(project, '.memory'), { recursive: true });
  fs.mkdirSync(home, { recursive: true });

  git(['init', '-q', '.'], project);
  git(['config', 'user.email', 't@example.com'], project);
  git(['config', 'user.name', 'T'], project);
  fs.writeFileSync(path.join(project, 'a.txt'), 'a\n');
  git(['add', 'a.txt'], project);
  git(['commit', '-qm', 'already recorded earlier'], project);
  const older = git(['rev-parse', '--short', 'HEAD'], project);
  fs.writeFileSync(path.join(project, 'b.txt'), 'b\n');
  git(['add', 'b.txt'], project);
  git(['commit', '-qm', 'brand new since last write'], project);
  const newer = git(['rev-parse', '--short', 'HEAD'], project);

  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(project, '.memory', 'today.md'),
    `# Today — ${today}\n\n## Sessions\n\n### [auto] 00:01 — project\n**Commits:**\n- \`${older} already recorded earlier\`\n`);

  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'no lessons here' }] } }) + '\n');

  return { root, project, home, transcript, older, newer };
}

function runHook(f) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: f.project,
    encoding: 'utf8',
    input: JSON.stringify({ transcript_path: f.transcript }),
    env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_ROOT: f.project },
  });
}

const count = (hay, needle) => hay.split(needle).length - 1;

test('compact does not re-append commits today.md already holds', () => {
  const f = fixture();
  try {
    const r = runHook(f);
    assert.equal(r.status, 0, r.stderr);
    const today = fs.readFileSync(path.join(f.project, '.memory', 'today.md'), 'utf8');
    assert.equal(count(today, f.older), 1, `older commit ${f.older} was recorded twice:\n${today}`);
    assert.equal(count(today, f.newer), 1, `newer commit ${f.newer} missing or duplicated:\n${today}`);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('compact still records commits today.md has never seen', () => {
  const f = fixture();
  try {
    // positive control: an empty today.md must produce a [compact] block with both
    // commits — otherwise the test above could pass simply by writing nothing.
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(f.project, '.memory', 'today.md'), `# Today — ${today}\n\n## Sessions\n\n`);
    const r = runHook(f);
    assert.equal(r.status, 0, r.stderr);
    const out = fs.readFileSync(path.join(f.project, '.memory', 'today.md'), 'utf8');
    assert.match(out, /### \[compact\] /);
    assert.equal(count(out, f.older), 1, out);
    assert.equal(count(out, f.newer), 1, out);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
