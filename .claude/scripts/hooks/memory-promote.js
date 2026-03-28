#!/usr/bin/env node
/**
 * Memory Promote Hook (Stop)
 *
 * Periodically checks for project-scoped instincts that appear
 * across multiple projects and promotes them to global/system memory
 * using instinct-cli.py promote --force.
 *
 * Frequency: once per day (lock file based).
 * Cross-platform (Windows, macOS, Linux).
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

// ── Mode gate: Heavy only ────────────────────────────────────
try {
  const { requireMode } = require('../lib/mode-check');
  if (!requireMode('heavy')) {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { d += c; });
    process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
    return;
  }
} catch {
  // mode-check not available — default to skip (safe: don't run Heavy hooks in unknown mode)
  let d = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { d += c; });
  process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
  return;
}
// ─────────────────────────────────────────────────────────────

const HOMUNCULUS_DIR = path.join(os.homedir(), '.claude', 'homunculus');
const LOCK_FILE = path.join(HOMUNCULUS_DIR, '.promote-lock');
const LOG_FILE = path.join(HOMUNCULUS_DIR, 'promote-log.jsonl');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shouldRun() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stat = fs.statSync(LOCK_FILE);
      if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
        return false;
      }
    }
  } catch {
    // If we can't read the lock, proceed
  }
  return true;
}

function touchLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, getDateString(), 'utf8');
}

function findInstinctCli() {
  // Look in the project's .claude/skills directory
  const projectCli = path.join(
    process.cwd(), '.claude', 'skills',
    'ecc-continuous-learning-v2', 'scripts', 'instinct-cli.py'
  );
  if (fs.existsSync(projectCli)) return projectCli;

  // Fallback: global location
  const globalCli = path.join(
    os.homedir(), '.claude', 'skills',
    'ecc-continuous-learning-v2', 'scripts', 'instinct-cli.py'
  );
  if (fs.existsSync(globalCli)) return globalCli;

  return null;
}

function findPython() {
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' });
      return cmd;
    } catch {
      // Try next
    }
  }
  return null;
}

const MAX_LOG_LINES = 100;

function appendLog(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');

  // Rotate: keep only last MAX_LOG_LINES entries
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LOG_LINES) {
      fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LOG_LINES).join('\n') + '\n', 'utf8');
    }
  } catch {
    // Non-critical, skip rotation on error
  }
}

function main() {
  if (!shouldRun()) return;

  const cliPath = findInstinctCli();
  if (!cliPath) {
    touchLock();
    return;
  }

  const python = findPython();
  if (!python) {
    touchLock();
    return;
  }

  // Dry run first to check for candidates
  let dryOutput;
  try {
    dryOutput = execFileSync(python, [cliPath, 'promote', '--dry-run', '--force'], {
      encoding: 'utf8',
      timeout: 10000,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    touchLock();
    return;
  }

  // Check if there are candidates. Be specific to avoid matching help text.
  // Look for patterns like "would promote N" or "→" with instinct IDs
  const nothingToPromote = dryOutput.includes('No instincts') || dryOutput.includes('0 instincts');
  const hasPromotions = !nothingToPromote && (
    /would promote \d+/i.test(dryOutput) ||
    /\b[a-z0-9_-]+\s*→\s*(?:system|global)/i.test(dryOutput)
  );

  if (nothingToPromote || !hasPromotions) {
    appendLog({
      timestamp: new Date().toISOString(),
      action: 'check',
      result: 'no_candidates',
      project: path.basename(process.cwd())
    });
    touchLock();
    return;
  }

  // Execute actual promotion
  let promoteOutput;
  try {
    promoteOutput = execFileSync(python, [cliPath, 'promote', '--force'], {
      encoding: 'utf8',
      timeout: 10000,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    appendLog({
      timestamp: new Date().toISOString(),
      action: 'promote',
      result: 'error',
      error: err.message,
      project: path.basename(process.cwd())
    });
    touchLock();
    return;
  }

  appendLog({
    timestamp: new Date().toISOString(),
    action: 'promote',
    result: 'success',
    output: promoteOutput.trim().substring(0, 500),
    project: path.basename(process.cwd())
  });

  touchLock();
}

// Read stdin (Claude Code hook protocol) then run
const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    const remaining = MAX_STDIN - stdinData.length;
    stdinData += chunk.substring(0, remaining);
  }
});
process.stdin.on('end', () => {
  try { main(); } catch (err) {
    console.error('[MemoryPromote] Error:', err.message);
  }
  process.exit(0);
});
