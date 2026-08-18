'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../lib/memory-sync.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function configure(repo, name = 'Test') {
  git(['config', 'user.email', `${name.toLowerCase()}@example.com`], repo);
  git(['config', 'user.name', name], repo);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-sync-test-'));
  const bare = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const project = path.join(root, 'project');
  const memory = path.join(project, '.memory');
  const home = path.join(root, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  git(['init', '--bare', bare], root);
  git(['clone', bare, seed], root);
  configure(seed, 'Seed');
  for (const [name, content] of Object.entries({
    'today.md': '# Today — 2026-08-07\n',
    'weekly.md': '# Weekly Summary\n',
    'long-term.md': '# Long-Term Memory\n',
  })) fs.writeFileSync(path.join(seed, name), content);
  git(['add', 'today.md', 'weekly.md', 'long-term.md'], seed);
  git(['commit', '-m', 'initial'], seed);
  git(['branch', '-M', 'quant-deploy'], seed);
  git(['push', '-u', 'origin', 'quant-deploy'], seed);
  git(['clone', '-b', 'quant-deploy', bare, memory], root);
  configure(memory, 'Local');
  return { root, bare, seed, project, memory, home };
}

function runHook(f, method, extraEnv = {}) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SCRIPT)}).${method}()`], {
    cwd: f.project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: f.home,
      CLAUDE_PROJECT_ROOT: f.project,
      MEMORY_REMOTE: f.bare,
      MEMORY_SYNC_MAX_RETRIES: '0',
      ...extraEnv,
    },
  });
}

function peerAdvance(f, filename, text) {
  const peer = path.join(f.root, `peer-${Date.now()}-${Math.random()}`);
  git(['clone', '-b', 'quant-deploy', f.bare, peer], f.root);
  configure(peer, 'Peer');
  fs.appendFileSync(path.join(peer, filename), text);
  git(['add', filename], peer);
  git(['commit', '-m', `remote ${filename}`], peer);
  git(['push'], peer);
}

test('pull detects current quant-deploy branch instead of hard-coded main', () => {
  const f = fixture();
  try {
    peerAdvance(f, 'weekly.md', 'remote-only\n');
    const result = runHook(f, 'pull');
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(f.memory, 'weekly.md'), 'utf8'), /remote-only/);
    assert.equal(git(['branch', '--show-current'], f.memory), 'quant-deploy');
    assert.match(result.stderr, /branch=quant-deploy/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('pull ignores inherited GIT_DIR redirection', () => {
  const f = fixture();
  try {
    peerAdvance(f, 'weekly.md', 'env-safe\n');
    const result = runHook(f, 'pull', { GIT_DIR: path.join(f.seed, '.git') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(f.memory, 'weekly.md'), 'utf8'), /env-safe/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('push commits local markdown, rebases remote advance, and preserves both', () => {
  const f = fixture();
  try {
    peerAdvance(f, 'weekly.md', 'remote-side\n');
    fs.appendFileSync(path.join(f.memory, 'today.md'), 'local-side\n');
    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    git(['fetch', 'origin', 'quant-deploy'], f.memory);
    assert.equal(git(['rev-list', '--left-right', '--count', 'HEAD...origin/quant-deploy'], f.memory), '0\t0', result.stderr);
    assert.match(fs.readFileSync(path.join(f.memory, 'today.md'), 'utf8'), /local-side/);
    assert.match(fs.readFileSync(path.join(f.memory, 'weekly.md'), 'utf8'), /remote-side/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('push refuses unknown dirty files and does not commit', () => {
  const f = fixture();
  try {
    const before = git(['rev-parse', 'HEAD'], f.memory);
    fs.appendFileSync(path.join(f.memory, 'today.md'), 'legitimate-change\n');
    fs.writeFileSync(path.join(f.memory, 'rogue.json'), '{"unsafe":true}\n');
    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /unknown dirty files/);
    assert.equal(git(['rev-parse', 'HEAD'], f.memory), before);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('push refuses conflict markers and does not commit', () => {
  const f = fixture();
  try {
    const before = git(['rev-parse', 'HEAD'], f.memory);
    fs.writeFileSync(path.join(f.memory, 'weekly.md'), '# Weekly\n<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\n');
    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /conflict markers present/);
    assert.equal(git(['rev-parse', 'HEAD'], f.memory), before);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
