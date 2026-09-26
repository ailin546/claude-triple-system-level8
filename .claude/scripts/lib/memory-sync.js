#!/usr/bin/env node
/**
 * Memory Git Sync — Pull/Push .memory/ as an independent git repo
 *
 * Enables multi-device, multi-AI sharing of the .memory/ directory
 * by treating it as a standalone git repository.
 *
 * Activation: set MEMORY_REMOTE env var or .claude/.memory-remote file.
 * If neither is set, all functions are no-ops (backward compatible).
 *
 * Cross-platform (Windows, macOS, Linux).
 * Non-blocking: all errors logged to stderr, never throws.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { getProjectMemoryDir, cleanGitEnv } = require('./project-root');
const MEMORY_DIR = getProjectMemoryDir();
const PROJECT_ROOT = path.dirname(MEMORY_DIR);
const GLOBAL_MEMORY_DIR = path.join(require('os').homedir(), '.memory');
// The memory remote keeps global memory on GLOBAL_BRANCH and each project on a
// branch named after the project. Project memory must never ride the global
// branch: its today.md is the same file as ~/.memory/today.md there, so syncing
// merges project logs into global memory and serves global memory back as the
// project's (rules/common/infrastructure.md §记忆同步安全闸).
const GLOBAL_BRANCH = 'main';
const IS_GLOBAL_DIR = path.resolve(MEMORY_DIR) === path.resolve(GLOBAL_MEMORY_DIR);
const PROJECT_BRANCH = IS_GLOBAL_DIR ? GLOBAL_BRANCH : path.basename(PROJECT_ROOT);
// Switch file lookup order: per-project override first, then the user-level
// default that ~/.claude/CLAUDE.md §仓库架构 documents as *the* switch. Reading
// only the project path meant the documented switch was never found, so pull()
// and push() silently no-op'd on every machine that used it — the memory repo
// then moved only when someone ran pull-all/push-all by hand, which is how it
// drifted far enough to pile up stash-pop conflicts.
const REMOTE_FILES = [
  path.join(PROJECT_ROOT, '.claude', '.memory-remote'),
  path.join(require('os').homedir(), '.claude', '.memory-remote'),
];
const MAX_RETRIES = (() => {
  const n = parseInt(process.env.MEMORY_SYNC_MAX_RETRIES ?? '', 10);
  return Number.isInteger(n) && n >= 0 ? n : 3;
})();
const RETRY_DELAYS = [2000, 4000, 8000]; // exponential backoff

function log(msg) {
  console.error(msg);
}

/**
 * Get the configured remote URL for the memory repo.
 * Sources (priority order):
 *   1. MEMORY_REMOTE env var
 *   2. .claude/.memory-remote file
 * Returns null if not configured (sync disabled).
 */
function getRemoteUrl() {
  if (process.env.MEMORY_REMOTE) {
    return process.env.MEMORY_REMOTE.trim();
  }
  for (const file of REMOTE_FILES) {
    try {
      const url = fs.readFileSync(file, 'utf8').trim();
      if (url) return url;
    } catch { /* try the next location */ }
  }
  return null;
}

/**
 * Check if .memory/ is a git repo.
 */
function isMemoryGitRepo() {
  return fs.existsSync(path.join(MEMORY_DIR, '.git'));
}

/**
 * Run a git command in a given directory.
 * Returns { ok, stdout, stderr }.
 */
function gitInDir(dir, args, opts = {}) {
  try {
    const stdout = execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: opts.timeout || 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanGitEnv(),
    });
    return { ok: true, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      error: err.message,
    };
  }
}

/**
 * Run a git command in the project .memory/ directory.
 */
function gitInMemory(args, opts = {}) {
  return gitInDir(MEMORY_DIR, args, opts);
}

/**
 * Current branch of a memory repo. Single home for branch detection — pull used
 * to hard-code 'main', which silently never pulled project repos (branch
 * 'quant-deploy') while push detected the branch correctly.
 */
function currentBranchIn(dir) {
  const r = gitInDir(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return (r.ok && r.stdout.trim()) || GLOBAL_BRANCH;
}

/**
 * Retry a function with exponential backoff.
 */
function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = fn();
    if (result.ok) return result;

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] || 8000;
      log(`[MemorySync] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`);
      // Sync sleep (acceptable in hook context)
      execFileSync('sleep', [String(delay / 1000)], { stdio: 'pipe' });
    }
  }
  return { ok: false, error: `${label} failed after ${MAX_RETRIES + 1} attempts` };
}

/**
 * Make .memory/ a clone of this project's own memory branch.
 * Returns true when .memory/ is (now) a git repo.
 *
 * Never falls back to the remote's default branch or to `git init` + push:
 * both put project memory on the global branch. A project whose branch does
 * not exist on the remote keeps its memory local until someone creates it.
 */
function ensureMemoryRepo(remoteUrl) {
  if (isMemoryGitRepo()) {
    // Verify remote is correct
    const result = gitInMemory(['remote', 'get-url', 'origin']);
    if (result.ok && result.stdout !== remoteUrl) {
      gitInMemory(['remote', 'set-url', 'origin', remoteUrl]);
      log(`[MemorySync] Updated remote URL to ${remoteUrl}`);
    }
    return true;
  }

  const probe = gitInDir(PROJECT_ROOT, ['ls-remote', '--heads', remoteUrl, PROJECT_BRANCH], { timeout: 20000 });
  if (!probe.ok) {
    log(`[MemorySync] Memory remote unreachable, project memory not initialized: ${probe.stderr || probe.error}`);
    return false;
  }
  if (!probe.stdout) {
    log(`[MemorySync] No memory branch '${PROJECT_BRANCH}' on the remote — project memory stays local`);
    return false;
  }

  log(`[MemorySync] Initializing memory repo from ${remoteUrl} (branch ${PROJECT_BRANCH})`);

  // Back up existing markdown; the clone needs an empty target.
  const existingFiles = [];
  try {
    for (const f of fs.readdirSync(MEMORY_DIR)) {
      if (f.endsWith('.md')) {
        existingFiles.push({ name: f, content: fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8') });
      }
    }
  } catch { /* no .memory/ yet */ }
  const tmpBackup = MEMORY_DIR + '.backup-' + Date.now();
  if (existingFiles.length > 0) fs.renameSync(MEMORY_DIR, tmpBackup);

  const clone = gitInDir(PROJECT_ROOT, ['clone', '--branch', PROJECT_BRANCH, remoteUrl, MEMORY_DIR], { timeout: 30000 });
  if (!clone.ok) {
    if (existingFiles.length > 0 && !fs.existsSync(MEMORY_DIR)) fs.renameSync(tmpBackup, MEMORY_DIR);
    log(`[MemorySync] Clone failed, project memory not initialized: ${clone.stderr || clone.error}`);
    return false;
  }

  // Merge back any local files that don't exist in remote
  for (const { name, content } of existingFiles) {
    const target = path.join(MEMORY_DIR, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, content, 'utf8');
      log(`[MemorySync] Restored local file: ${name}`);
    }
  }
  if (existingFiles.length > 0) {
    try { fs.rmSync(tmpBackup, { recursive: true, force: true }); } catch {}
  }
  log(`[MemorySync] Cloned memory repo successfully`);
  return true;
}

/**
 * Project memory checked out on the global branch shares today.md & co. with
 * ~/.memory, so syncing it would merge the two. Refuse rather than guess.
 */
function projectOnGlobalBranch() {
  if (IS_GLOBAL_DIR) return false;
  if (currentBranchIn(MEMORY_DIR) !== GLOBAL_BRANCH) return false;
  log(`[MemorySync] Sync refused (project) — ${MEMORY_DIR} is on the global branch '${GLOBAL_BRANCH}'; give the project its own branch`);
  return true;
}

// ══════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════

/**
 * Pull latest memory from remote.
 * Call at SessionStart, before reading memory files.
 * No-op if sync is not configured.
 */
function pull() {
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) return; // Sync not configured — silent no-op

  pullProjectMemory(remoteUrl);
  // Global memory syncs on its own, whether or not this project has memory.
  pullGlobalMemory();
}

function pullProjectMemory(remoteUrl) {
  try {
    if (!ensureMemoryRepo(remoteUrl) || projectOnGlobalBranch()) return;

    const branch = currentBranchIn(MEMORY_DIR);
    log(`[MemorySync] Pull (project) branch=${branch}`);

    const result = withRetry(
      () => gitInMemory(['pull', '--rebase', 'origin', branch], { timeout: 20000 }),
      'git pull'
    );

    if (result.ok) {
      log('[MemorySync] Pull successful (project)');
    } else {
      // Rebase conflict — try merge instead
      gitInMemory(['rebase', '--abort']);
      const mergeResult = gitInMemory(['pull', 'origin', branch], { timeout: 20000 });
      if (mergeResult.ok) {
        log('[MemorySync] Pull (merge) successful after rebase conflict');
      } else {
        log(`[MemorySync] Pull failed (project): ${mergeResult.error || mergeResult.stderr}`);
      }
    }
  } catch (err) {
    log(`[MemorySync] Pull error (project, non-blocking): ${err.message}`);
  }
}

/**
 * Pull global ~/.memory/ from its own remote (if it's an independent git repo).
 * Skipped if global dir === project dir (already pulled above).
 */
function pullGlobalMemory() {
  try {
    if (path.resolve(GLOBAL_MEMORY_DIR) === path.resolve(MEMORY_DIR)) return;
    if (!fs.existsSync(path.join(GLOBAL_MEMORY_DIR, '.git'))) return;

    const result = withRetry(
      () => gitInDir(GLOBAL_MEMORY_DIR, ['pull', '--rebase', 'origin', GLOBAL_BRANCH], { timeout: 20000 }),
      'global git pull'
    );

    if (result.ok) {
      log('[MemorySync] Pull successful (global ~/.memory/)');
    } else {
      gitInDir(GLOBAL_MEMORY_DIR, ['rebase', '--abort']);
      const mergeResult = gitInDir(GLOBAL_MEMORY_DIR, ['pull', 'origin', GLOBAL_BRANCH], { timeout: 20000 });
      if (mergeResult.ok) {
        log('[MemorySync] Pull (merge) successful (global) after rebase conflict');
      } else {
        log(`[MemorySync] Pull failed (global): ${mergeResult.error || mergeResult.stderr}`);
      }
    }
  } catch (err) {
    log(`[MemorySync] Global pull error (non-blocking): ${err.message}`);
  }
}

/**
 * Push memory changes to remote.
 * Call at Stop, after writing memory files.
 * No-op if sync is not configured or no changes.
 */
/**
 * Paths from `git status --porcelain`, handling renames and quoted names.
 */
function dirtyPathsFrom(porcelain) {
  const out = [];
  for (const line of String(porcelain).split('\n')) {
    if (!line.trim()) continue;
    // Not a fixed-width slice: gitInDir trims its stdout, so the leading space of
    // an unstaged-only status (" M weekly.md") is already gone by the time we see
    // the first line. Match the status column instead of counting characters.
    const m = line.match(/^\s*([MADRCU?!]{1,2})\s+(.*)$/);
    if (!m) continue;
    let p = m[2].trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim();
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    if (p) out.push(p);
  }
  return out;
}

/**
 * The memory repo holds hand-written markdown only (.gitignore already excludes
 * runtime state). Anything else in the working tree is not ours to auto-publish.
 */
function unsafeDirtyPaths(porcelain) {
  return dirtyPathsFrom(porcelain).filter((p) => {
    const lower = p.toLowerCase();
    return !lower.endsWith('.md') && path.basename(lower) !== '.gitignore';
  });
}

/**
 * Files carrying unresolved conflict markers. Only `<<<<<<< ` / `>>>>>>> ` are
 * tested — a bare `=======` line is a legitimate markdown setext underline.
 */
function dirtyFilesWithConflictMarkers(porcelain) {
  const hits = [];
  for (const rel of dirtyPathsFrom(porcelain)) {
    const abs = path.join(MEMORY_DIR, rel);
    try {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const text = fs.readFileSync(abs, 'utf8');
      if (/^<<<<<<< /m.test(text) || /^>>>>>>> /m.test(text)) hits.push(rel);
    } catch { /* unreadable — leave judgement to the human */ }
  }
  return hits;
}

/**
 * Sync whatever is already committed: rebase onto the remote, then push.
 * Single home for the pull-then-push sequence — both the "committed something
 * just now" and the "clean tree with a backlog" paths go through here.
 */
function pushPending(branch) {
  const pullResult = gitInMemory(['pull', '--rebase', 'origin', branch], { timeout: 20000 });
  if (!pullResult.ok) {
    // Rebase conflict — abort and try merge
    gitInMemory(['rebase', '--abort']);
    gitInMemory(['pull', 'origin', branch], { timeout: 20000 });
  }

  const result = withRetry(
    () => gitInMemory(['push', 'origin', branch], { timeout: 20000 }),
    'git push'
  );

  if (result.ok) {
    log('[MemorySync] Push successful (project)');
  } else {
    log(`[MemorySync] Push failed (project): ${result.error || result.stderr}`);
  }
}

function push() {
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) return; // Sync not configured — silent no-op

  pushProjectMemory();
  // Global memory syncs on its own, whether or not this project has memory.
  pushGlobalMemory();
}

function pushProjectMemory() {
  try {
    // Initialization belongs to pull() at SessionStart; probing the remote on
    // every Stop would tax each turn of a project that has no memory branch.
    if (!isMemoryGitRepo() || projectOnGlobalBranch()) return;

    // Check for changes
    const status = gitInMemory(['status', '--porcelain']);
    const branch = currentBranchIn(MEMORY_DIR);

    if (!status.stdout) {
      // A clean tree is not the same as nothing to do: commits made outside this
      // hook (a resolved rebase, a manual fix) or left behind by an earlier failed
      // push would otherwise sit unpushed forever, which is how machines diverge.
      const ahead = gitInMemory(['rev-list', '--count', `origin/${branch}..HEAD`]);
      if (ahead.ok && ahead.stdout.trim() === '0') return;
      log(`[MemorySync] Clean tree, ${ahead.ok ? ahead.stdout.trim() : 'unknown'} unpushed commit(s) — pushing anyway`);
      return pushPending(branch);
    }

    // Safety gates — this repo is committed and pushed by a hook with no human in
    // the loop, so anything wrong in the working tree gets published unseen.
    // (2026-09-03 a peer machine published weekly.md with unresolved conflict
    // markers exactly this way; it took a manual cleanup to undo.)
    const unsafe = unsafeDirtyPaths(status.stdout);
    if (unsafe.length) {
      log(`[MemorySync] Push refused (project) — unknown dirty files, memory repo tracks .md only: ${unsafe.join(', ')}`);
      return;
    }

    const conflicted = dirtyFilesWithConflictMarkers(status.stdout);
    if (conflicted.length) {
      log(`[MemorySync] Push refused (project) — conflict markers present: ${conflicted.join(', ')}`);
      return;
    }

    // Stage and commit
    gitInMemory(['add', '-A']);

    const today = new Date().toISOString().slice(0, 10);
    const tool = process.env.CLAUDE_TOOL_NAME || 'Claude Code';
    const host = require('os').hostname();
    gitInMemory(['commit', '-m', `memory: ${today} [${tool}@${host}]`]);

    pushPending(branch);
  } catch (err) {
    log(`[MemorySync] Push error (project, non-blocking): ${err.message}`);
  }
}

/**
 * Push global ~/.memory/ to its own remote (if it's an independent git repo).
 * Skipped if global dir === project dir (already synced above).
 */
function pushGlobalMemory() {
  try {
    // Skip if global is same as project (already handled)
    if (path.resolve(GLOBAL_MEMORY_DIR) === path.resolve(MEMORY_DIR)) return;

    // Only sync if global .memory/ is its own git repo
    if (!fs.existsSync(path.join(GLOBAL_MEMORY_DIR, '.git'))) return;

    // Check for changes
    const status = gitInDir(GLOBAL_MEMORY_DIR, ['status', '--porcelain']);
    if (!status.stdout) return;

    // Stage, commit, push
    gitInDir(GLOBAL_MEMORY_DIR, ['add', '-A']);

    const today = new Date().toISOString().slice(0, 10);
    const tool = process.env.CLAUDE_TOOL_NAME || 'Claude Code';
    const host = require('os').hostname();
    gitInDir(GLOBAL_MEMORY_DIR, ['commit', '-m', `memory: ${today} [${tool}@${host}]`]);

    const pullResult = gitInDir(GLOBAL_MEMORY_DIR, ['pull', '--rebase', 'origin', GLOBAL_BRANCH], { timeout: 20000 });
    if (!pullResult.ok) {
      gitInDir(GLOBAL_MEMORY_DIR, ['rebase', '--abort']);
      gitInDir(GLOBAL_MEMORY_DIR, ['pull', 'origin', GLOBAL_BRANCH], { timeout: 20000 });
    }

    const result = withRetry(
      () => gitInDir(GLOBAL_MEMORY_DIR, ['push', 'origin', GLOBAL_BRANCH], { timeout: 20000 }),
      'global git push'
    );

    if (result.ok) {
      log('[MemorySync] Push successful (global ~/.memory/)');
    } else {
      log(`[MemorySync] Push failed (global): ${result.error || result.stderr}`);
    }
  } catch (err) {
    log(`[MemorySync] Global push error (non-blocking): ${err.message}`);
  }
}

/**
 * Check if memory sync is configured and active.
 */
function isEnabled() {
  return !!getRemoteUrl();
}

module.exports = { pull, push, isEnabled, getRemoteUrl };
