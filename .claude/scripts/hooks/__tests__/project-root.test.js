'use strict';
// lib/project-root.js::getProjectRoot — the one place a hook decides whose
// `.claude/` state it reads and writes. Every case asks both entry points
// (project-root and utils) and requires the same answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const LIB = path.resolve(__dirname, '../../lib');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A repo on branch `trunk` with a nested directory, plus a linked worktree on `feature`.
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'project-root-test-')));
  const home = path.join(root, 'home');
  const main = path.join(root, 'proj');
  const nested = path.join(main, 'nested', 'deeper');
  fs.mkdirSync(path.join(home, '.claude', 'scripts'), { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  git(['init', '-b', 'trunk'], main);
  git(['config', 'user.email', 't@example.com'], main);
  git(['config', 'user.name', 'T'], main);
  fs.writeFileSync(path.join(nested, 'f.txt'), 'x\n');
  git(['add', '.'], main);
  git(['commit', '-m', 'init'], main);
  const wt = path.join(root, 'wt');
  git(['worktree', 'add', '-b', 'feature', wt], main);
  return { root, home, main, nested, wt, wtNested: path.join(wt, 'nested', 'deeper') };
}

function withFixture(fn) {
  const f = fixture();
  try {
    fn(f);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
}

// Only the listed variables are set, so the runner's own environment cannot leak in.
function envFor(f, vars) {
  const env = { ...process.env, HOME: f.home, ...vars };
  for (const k of ['CLAUDE_PROJECT_ROOT', 'CLAUDE_PROJECT_DIR']) if (!(k in vars)) delete env[k];
  return env;
}

function resolve(f, cwd, vars = {}) {
  const r = spawnSync(process.execPath, ['-e', `
    const a = require(${JSON.stringify(path.join(LIB, 'project-root.js'))}).getProjectRoot();
    const b = require(${JSON.stringify(path.join(LIB, 'utils.js'))}).getProjectRoot();
    process.stdout.write(JSON.stringify([a, b]));`], { cwd, encoding: 'utf8', env: envFor(f, vars) });
  assert.equal(r.status, 0, r.stderr);
  const [a, b] = JSON.parse(r.stdout);
  assert.equal(b, a, 'utils.getProjectRoot must be the same resolver');
  return a;
}

test('a session keeps its launch directory while the shell wanders, even into a worktree', () => withFixture((f) => {
  assert.equal(resolve(f, f.nested, { CLAUDE_PROJECT_DIR: f.main }), f.main);
  assert.equal(resolve(f, f.wtNested, { CLAUDE_PROJECT_DIR: f.main }), f.main);
}));

test('without a launch directory, a subdirectory resolves to its checkout root', () => withFixture((f) => {
  assert.equal(resolve(f, f.nested), f.main);
}));

test('a linked worktree is its own root, not the main checkout', () => withFixture((f) => {
  assert.equal(resolve(f, f.wtNested), f.wt);
  assert.equal(resolve(f, f.wtNested, { CLAUDE_PROJECT_DIR: f.wt }), f.wt);
}));

test('outside git the launch directory is the root; only without it the cwd', () => withFixture((f) => {
  const plain = path.join(f.root, 'plain');
  const deep = path.join(plain, 'deep');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(resolve(f, deep, { CLAUDE_PROJECT_DIR: plain }), plain);
  assert.equal(resolve(f, deep), deep);
}));

test('inside ~/.claude the root is HOME, so state never nests as ~/.claude/.claude', () => withFixture((f) => {
  assert.equal(resolve(f, path.join(f.home, '.claude', 'scripts')), f.home);
}));

test("inside a project's .memory repo the root is the project", () => withFixture((f) => {
  const memory = path.join(f.main, '.memory');
  fs.mkdirSync(memory);
  git(['init'], memory);
  assert.equal(resolve(f, memory), f.main);
  assert.equal(resolve(f, f.nested, { CLAUDE_PROJECT_DIR: memory }), f.main);
}));

test('CLAUDE_PROJECT_ROOT is an explicit override, taken as given', () => withFixture((f) => {
  const sub = path.join(f.main, 'nested');
  assert.equal(resolve(f, f.nested, { CLAUDE_PROJECT_ROOT: sub, CLAUDE_PROJECT_DIR: f.main }), sub);
}));

test('modified files are listed from the root checkout, with paths inside it', () => withFixture((f) => {
  fs.writeFileSync(path.join(f.nested, 'f.txt'), 'changed\n');
  const r = spawnSync(process.execPath, ['-e',
    `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.join(LIB, 'utils.js'))}).getGitModifiedFiles()))`],
  { cwd: f.wtNested, encoding: 'utf8', env: envFor(f, { CLAUDE_PROJECT_DIR: f.main }) });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [path.join(f.nested, 'f.txt')]);
}));
