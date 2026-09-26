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
    // The rebase path itself must target the right branch — a wrong branch that
    // only works because the merge fallback rescues it is a silent degradation.
    assert.doesNotMatch(result.stderr, /after rebase conflict/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('pull ignores inherited GIT_DIR redirection', () => {
  const f = fixture();
  try {
    peerAdvance(f, 'weekly.md', 'env-safe\n');
    const seedHeadBefore = git(['rev-parse', 'HEAD'], f.seed);
    const result = runHook(f, 'pull', { GIT_DIR: path.join(f.seed, '.git') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(f.memory, 'weekly.md'), 'utf8'), /env-safe/);
    // Discriminating assertion: without env sanitation git would honour GIT_DIR and
    // operate on the seed repo instead. Content landing in .memory/ alone does not
    // prove isolation — the pointed-at repo must be untouched.
    assert.equal(git(['rev-parse', 'HEAD'], f.seed), seedHeadBefore, 'seed repo was mutated via inherited GIT_DIR');
    assert.equal(git(['rev-parse', 'HEAD'], f.memory), git(['rev-parse', 'origin/quant-deploy'], f.memory));
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

test('push accepts markdown whose setext underline looks like a conflict marker', () => {
  const f = fixture();
  try {
    const before = git(['rev-parse', 'HEAD'], f.memory);
    fs.writeFileSync(path.join(f.memory, 'weekly.md'), 'Weekly Summary\n=======\n\nbody\n');
    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /conflict markers present/);
    assert.notEqual(git(['rev-parse', 'HEAD'], f.memory), before, 'a legitimate setext heading must not block memory sync');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('push flushes commits that are already committed but never pushed', () => {
  const f = fixture();
  try {
    // clean tree + a local commit the hook did not make (resolved rebase, manual fix,
    // or an earlier push that failed) — it must not sit unpushed forever
    fs.appendFileSync(path.join(f.memory, 'today.md'), 'committed-out-of-band\n');
    git(['add', 'today.md'], f.memory);
    git(['commit', '-m', 'out of band'], f.memory);
    assert.equal(git(['status', '--porcelain'], f.memory), '', 'precondition: tree must be clean');
    const local = git(['rev-parse', 'HEAD'], f.memory);

    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    git(['fetch', 'origin', 'quant-deploy'], f.memory);
    assert.equal(git(['rev-parse', 'origin/quant-deploy'], f.memory), local, 'remote did not receive the pending commit');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('push stays quiet when there is genuinely nothing to do', () => {
  const f = fixture();
  try {
    // positive control for the test above: clean tree AND nothing ahead must not push
    const result = runHook(f, 'push');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /Push successful \(project\)/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('remote switch is found at the user-level path CLAUDE.md documents', () => {
  const f = fixture();
  try {
    // No MEMORY_REMOTE env and no project-level switch — only ~/.claude/.memory-remote,
    // which is the location ~/.claude/CLAUDE.md §仓库架构 calls *the* switch. Reading
    // the project path alone made pull/push silently no-op.
    fs.mkdirSync(path.join(f.home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(f.home, '.claude', '.memory-remote'), f.bare + '\n');
    assert.ok(!fs.existsSync(path.join(f.project, '.claude', '.memory-remote')));

    fs.appendFileSync(path.join(f.memory, 'today.md'), 'switch-found\n');
    const env = { ...process.env, HOME: f.home, CLAUDE_PROJECT_ROOT: f.project, MEMORY_SYNC_MAX_RETRIES: '0' };
    delete env.MEMORY_REMOTE;
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SCRIPT)}).push()`],
      { cwd: f.project, encoding: 'utf8', env });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Push successful \(project\)/, 'switch not resolved — sync silently disabled');
    git(['fetch', 'origin', 'quant-deploy'], f.memory);
    assert.match(git(['show', 'origin/quant-deploy:today.md'], f.memory), /switch-found/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

// ── Which memory a session uses, and which branch it may sync ──────────────

const RESOLVER = path.resolve(__dirname, '../../lib/project-root.js');
const HOOKS_DIR = path.resolve(__dirname, '..');

function tmpRoot(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// Remote whose default branch is the global memory, plus the listed branches.
function remoteWithBranches(root, branches) {
  const bare = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  git(['init', '--bare', bare], root);
  git(['clone', bare, seed], root);
  configure(seed, 'Seed');
  fs.writeFileSync(path.join(seed, 'today.md'), '# Today — global\n');
  git(['add', 'today.md'], seed);
  git(['commit', '-m', 'initial'], seed);
  for (const branch of branches) git(['push', 'origin', `HEAD:refs/heads/${branch}`], seed);
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
  return bare;
}

function runSync(method, project, home, bare) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SCRIPT)}).${method}()`], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PROJECT_ROOT: project,
      MEMORY_REMOTE: bare,
      MEMORY_SYNC_MAX_RETRIES: '0',
    },
  });
}

function resolveMemoryDir(cwd, home) {
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_PROJECT_ROOT;
  const r = spawnSync(process.execPath,
    ['-e', `process.stdout.write(require(${JSON.stringify(RESOLVER)}).getProjectMemoryDir())`],
    { cwd, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('memory dir resolves to the main checkout from linked worktrees and subdirectories', () => {
  const root = tmpRoot('memory-root-test-');
  try {
    const home = path.join(root, 'home');
    const main = path.join(root, 'proj');
    fs.mkdirSync(path.join(main, 'nested', 'deeper'), { recursive: true });
    git(['init'], main);
    configure(main);
    fs.writeFileSync(path.join(main, 'nested', 'deeper', 'f.txt'), 'x\n');
    git(['add', '.'], main);
    git(['commit', '-m', 'init'], main);
    const wt = path.join(root, 'wt');
    git(['worktree', 'add', '-b', 'feature', wt], main);
    for (const cwd of [main, path.join(main, 'nested', 'deeper'), wt, path.join(wt, 'nested', 'deeper')]) {
      assert.equal(resolveMemoryDir(cwd, home), path.join(main, '.memory'), `resolved from ${cwd}`);
    }
    const plain = path.join(root, 'plain');
    fs.mkdirSync(plain);
    assert.equal(resolveMemoryDir(plain, home), path.join(plain, '.memory'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a project without its own memory branch is never put on the global branch', () => {
  const root = tmpRoot('memory-branch-test-');
  try {
    const bare = remoteWithBranches(root, ['main']);
    const project = path.join(root, 'alpha');
    const home = path.join(root, 'home');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
    const globalBefore = git(['rev-parse', 'refs/heads/main'], bare);
    const pulled = runSync('pull', project, home, bare);
    assert.equal(pulled.status, 0, pulled.stderr);
    assert.equal(fs.existsSync(path.join(project, '.memory', '.git')), false, 'project memory was cloned from the global branch');
    const pushed = runSync('push', project, home, bare);
    assert.equal(pushed.status, 0, pushed.stderr);
    assert.equal(fs.existsSync(path.join(project, '.memory', '.git')), false, 'project memory was initialized onto the global branch');
    assert.equal(git(['rev-parse', 'refs/heads/main'], bare), globalBefore);
    assert.match(pulled.stderr, /No memory branch 'alpha'/);
    // Stop runs push() every turn; initialization is pull()'s job at SessionStart.
    assert.doesNotMatch(pushed.stderr, /No memory branch|Memory remote unreachable/, 'push probed the remote');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a project with its own memory branch is cloned onto that branch', () => {
  const root = tmpRoot('memory-branch-test-');
  try {
    const bare = remoteWithBranches(root, ['main', 'alpha']);
    const project = path.join(root, 'alpha');
    const home = path.join(root, 'home');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
    const r = runSync('pull', project, home, bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(['branch', '--show-current'], path.join(project, '.memory')), 'alpha');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('project memory checked out on the global branch refuses to sync either way', () => {
  const root = tmpRoot('memory-branch-test-');
  try {
    const bare = remoteWithBranches(root, ['main']);
    const project = path.join(root, 'alpha');
    const memory = path.join(project, '.memory');
    const home = path.join(root, 'home');
    fs.mkdirSync(home, { recursive: true });
    git(['clone', '-b', 'main', bare, memory], root);
    configure(memory, 'Local');
    const localHead = git(['rev-parse', 'HEAD'], memory);
    fs.appendFileSync(path.join(memory, 'today.md'), 'project-local\n');
    const peer = path.join(root, 'peer');
    git(['clone', '-b', 'main', bare, peer], root);
    configure(peer, 'Peer');
    fs.appendFileSync(path.join(peer, 'today.md'), 'global-peer\n');
    git(['commit', '-am', 'peer'], peer);
    git(['push'], peer);
    const globalAfterPeer = git(['rev-parse', 'refs/heads/main'], bare);

    const pushed = runSync('push', project, home, bare);
    assert.equal(pushed.status, 0, pushed.stderr);
    assert.equal(git(['rev-parse', 'refs/heads/main'], bare), globalAfterPeer, 'project log was published into global memory');
    const pulled = runSync('pull', project, home, bare);
    assert.equal(pulled.status, 0, pulled.stderr);
    assert.equal(git(['rev-parse', 'HEAD'], memory), localHead, 'global memory was pulled in as project memory');
    assert.match(pushed.stderr, /Sync refused \(project\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('global memory still syncs when the project has no memory of its own', () => {
  const root = tmpRoot('memory-branch-test-');
  try {
    const bare = remoteWithBranches(root, ['main']);
    const project = path.join(root, 'alpha');
    const home = path.join(root, 'home');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
    const globalMemory = path.join(home, '.memory');
    git(['clone', '-b', 'main', bare, globalMemory], root);
    configure(globalMemory, 'Global');
    fs.appendFileSync(path.join(globalMemory, 'today.md'), 'global-lesson\n');
    const r = runSync('push', project, home, bare);
    assert.equal(r.status, 0, r.stderr);
    assert.match(git(['show', 'refs/heads/main:today.md'], bare), /global-lesson/, r.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('memory readers, writers and the syncer resolve the project memory dir the same way', () => {
  const files = ['session-start.js', 'stop-summary.js', 'pre-compact.js', 'periodic-memory.js']
    .map((f) => path.join(HOOKS_DIR, f))
    .concat(SCRIPT);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /getProjectMemoryDir\(\)/, `${path.basename(file)} does not use getProjectMemoryDir()`);
    const ownJoins = (src.match(/join\([^;]*?['"]\.memory['"]\s*\)/g) || []).filter((j) => !/HOME|homedir/.test(j));
    assert.deepEqual(ownJoins, [], `${path.basename(file)} builds its own project .memory path`);
  }
});

test('a session inside ~/.claude syncs global memory as its own memory', () => {
  const root = tmpRoot('memory-branch-test-');
  try {
    const bare = remoteWithBranches(root, ['main']);
    const home = path.join(root, 'home');
    const inClaude = path.join(home, '.claude', 'rules');
    fs.mkdirSync(inClaude, { recursive: true });
    const globalMemory = path.join(home, '.memory');
    git(['clone', '-b', 'main', bare, globalMemory], root);
    configure(globalMemory, 'Global');
    const peer = path.join(root, 'peer');
    git(['clone', '-b', 'main', bare, peer], root);
    configure(peer, 'Peer');
    fs.appendFileSync(path.join(peer, 'today.md'), 'global-peer\n');
    git(['commit', '-am', 'peer'], peer);
    git(['push'], peer);
    const r = runSync('pull', inClaude, home, bare);
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(globalMemory, 'today.md'), 'utf8'), /global-peer/, r.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
