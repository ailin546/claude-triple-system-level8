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

const { getProjectRoot } = require('./project-root');
const PROJECT_ROOT = getProjectRoot();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const GLOBAL_MEMORY_DIR = path.join(require('os').homedir(), '.memory');
const REMOTE_FILE = path.join(PROJECT_ROOT, '.claude', '.memory-remote');
const MAX_RETRIES = 3;
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
  try {
    const url = fs.readFileSync(REMOTE_FILE, 'utf8').trim();
    return url || null;
  } catch {
    return null;
  }
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
 * Initialize .memory/ as a git repo if not already.
 * Called internally, not directly by users.
 */
function ensureMemoryRepo(remoteUrl) {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  if (isMemoryGitRepo()) {
    // Verify remote is correct
    const result = gitInMemory(['remote', 'get-url', 'origin']);
    if (result.ok && result.stdout !== remoteUrl) {
      gitInMemory(['remote', 'set-url', 'origin', remoteUrl]);
      log(`[MemorySync] Updated remote URL to ${remoteUrl}`);
    }
    return true;
  }

  // Try cloning first (repo may already exist remotely)
  log(`[MemorySync] Initializing memory repo from ${remoteUrl}`);

  // Back up existing files
  const existingFiles = [];
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const f of files) {
      if (f.endsWith('.md')) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8');
        existingFiles.push({ name: f, content });
      }
    }
  } catch {}

  // Try to clone
  try {
    // Remove .memory/ temporarily for clone
    const tmpBackup = MEMORY_DIR + '.backup-' + Date.now();
    if (existingFiles.length > 0) {
      fs.renameSync(MEMORY_DIR, tmpBackup);
    }

    const cloneResult = execFileSync('git', ['clone', remoteUrl, MEMORY_DIR], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log(`[MemorySync] Cloned memory repo successfully`);

    // Merge back any local files that don't exist in remote
    if (existingFiles.length > 0) {
      for (const { name, content } of existingFiles) {
        const target = path.join(MEMORY_DIR, name);
        if (!fs.existsSync(target)) {
          fs.writeFileSync(target, content, 'utf8');
          log(`[MemorySync] Restored local file: ${name}`);
        }
      }
      // Clean up backup
      try { fs.rmSync(tmpBackup, { recursive: true, force: true }); } catch {}
    }

    return true;
  } catch (cloneErr) {
    // Clone failed — init new repo
    log(`[MemorySync] Clone failed (${cloneErr.message}), initializing new repo`);

    // Restore backup if it exists
    const tmpBackup = MEMORY_DIR + '.backup-' + Date.now();
    // Check for any backup directory
    try {
      const parent = path.dirname(MEMORY_DIR);
      const backups = fs.readdirSync(parent).filter(f => f.startsWith('.memory.backup-'));
      if (backups.length > 0 && !fs.existsSync(MEMORY_DIR)) {
        fs.renameSync(path.join(parent, backups[0]), MEMORY_DIR);
      }
    } catch {}

    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    gitInMemory(['init']);
    gitInMemory(['remote', 'add', 'origin', remoteUrl]);

    // Restore existing files
    for (const { name, content } of existingFiles) {
      const target = path.join(MEMORY_DIR, name);
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, content, 'utf8');
      }
    }

    // Initial commit if files exist
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
    if (files.length > 0) {
      gitInMemory(['add', '-A']);
      gitInMemory(['commit', '-m', 'init: memory repo']);
      // Try to push (may fail if remote is empty, that's ok)
      gitInMemory(['push', '-u', 'origin', 'main']);
    }

    log(`[MemorySync] Initialized new memory repo`);
    return true;
  }
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

  try {
    ensureMemoryRepo(remoteUrl);

    if (!isMemoryGitRepo()) {
      log('[MemorySync] .memory/ is not a git repo after init, skipping pull');
      return;
    }

    const result = withRetry(
      () => gitInMemory(['pull', '--rebase', 'origin', 'main'], { timeout: 20000 }),
      'git pull'
    );

    if (result.ok) {
      log('[MemorySync] Pull successful (project)');
    } else {
      // Rebase conflict — try merge instead
      gitInMemory(['rebase', '--abort']);
      const mergeResult = gitInMemory(['pull', 'origin', 'main'], { timeout: 20000 });
      if (mergeResult.ok) {
        log('[MemorySync] Pull (merge) successful after rebase conflict');
      } else {
        log(`[MemorySync] Pull failed (project): ${mergeResult.error || mergeResult.stderr}`);
      }
    }
  } catch (err) {
    log(`[MemorySync] Pull error (project, non-blocking): ${err.message}`);
  }

  // Also pull global ~/.memory/ if it's a separate git repo
  pullGlobalMemory();
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
      () => gitInDir(GLOBAL_MEMORY_DIR, ['pull', '--rebase', 'origin', 'main'], { timeout: 20000 }),
      'global git pull'
    );

    if (result.ok) {
      log('[MemorySync] Pull successful (global ~/.memory/)');
    } else {
      gitInDir(GLOBAL_MEMORY_DIR, ['rebase', '--abort']);
      const mergeResult = gitInDir(GLOBAL_MEMORY_DIR, ['pull', 'origin', 'main'], { timeout: 20000 });
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
function push() {
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) return; // Sync not configured — silent no-op

  try {
    if (!isMemoryGitRepo()) {
      ensureMemoryRepo(remoteUrl);
    }

    if (!isMemoryGitRepo()) {
      log('[MemorySync] .memory/ is not a git repo, skipping push');
      return;
    }

    // Check for changes
    const status = gitInMemory(['status', '--porcelain']);
    if (!status.stdout) {
      // No changes — skip
      return;
    }

    // Stage and commit
    gitInMemory(['add', '-A']);

    const today = new Date().toISOString().slice(0, 10);
    const tool = process.env.CLAUDE_TOOL_NAME || 'Claude Code';
    const host = require('os').hostname();
    gitInMemory(['commit', '-m', `memory: ${today} [${tool}@${host}]`]);

    // Pull before push to avoid conflicts
    const pullResult = gitInMemory(['pull', '--rebase', 'origin', 'main'], { timeout: 20000 });
    if (!pullResult.ok) {
      // Rebase conflict — abort and try merge
      gitInMemory(['rebase', '--abort']);
      gitInMemory(['pull', 'origin', 'main'], { timeout: 20000 });
    }

    // Push with retry
    const result = withRetry(
      () => gitInMemory(['push', 'origin', 'main'], { timeout: 20000 }),
      'git push'
    );

    if (result.ok) {
      log('[MemorySync] Push successful (project)');
    } else {
      log(`[MemorySync] Push failed (project): ${result.error || result.stderr}`);
    }
  } catch (err) {
    log(`[MemorySync] Push error (project, non-blocking): ${err.message}`);
  }

  // Also sync global ~/.memory/ if it's a separate git repo
  pushGlobalMemory();
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

    const pullResult = gitInDir(GLOBAL_MEMORY_DIR, ['pull', '--rebase', 'origin', 'main'], { timeout: 20000 });
    if (!pullResult.ok) {
      gitInDir(GLOBAL_MEMORY_DIR, ['rebase', '--abort']);
      gitInDir(GLOBAL_MEMORY_DIR, ['pull', 'origin', 'main'], { timeout: 20000 });
    }

    const result = withRetry(
      () => gitInDir(GLOBAL_MEMORY_DIR, ['push', 'origin', 'main'], { timeout: 20000 }),
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
