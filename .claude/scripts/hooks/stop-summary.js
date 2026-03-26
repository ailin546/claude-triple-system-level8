#!/usr/bin/env node
/**
 * Stop Hook: Lightweight session summary (Always-on)
 *
 * Records only high-value information at session end:
 * - Decisions made (and reasons)
 * - Constraints discovered
 * - Open loops (unfinished work)
 *
 * Replaces the 9-hook Stop chain for Fast/Standard modes.
 * Heavy mode still runs the full Stop chain.
 *
 * Writes to .memory/today.md (cross-tool shared memory).
 * Also checks for console.log in modified files (merged from check-console-log.js).
 *
 * Cross-platform (Windows, macOS, Linux)
 * Non-blocking: errors are logged but never block exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log, getProjectRoot } = require('../lib/utils');

const PROJECT_ROOT = getProjectRoot();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');

// Exclusions for console.log check
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

function getCurrentMode() {
  try {
    return fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
  } catch {
    return 'fast';
  }
}

function getTimestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Local date string (YYYY-MM-DD) — fixes P3 timezone issue */
function getLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Daily rotation: if today.md has entries from a previous day,
 * archive them to weekly.md and reset today.md.
 * Fixes P2: rotation was only in Heavy-mode shared-memory-sync.
 */
function rotateTodayIfNeeded() {
  if (!fs.existsSync(TODAY_FILE)) return;

  try {
    const content = fs.readFileSync(TODAY_FILE, 'utf8');
    if (!content.trim()) return;

    // Extract date from first heading like "# Today — 2026-03-25"
    const dateMatch = content.match(/# Today\s*[-—]\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const fileDate = dateMatch[1];
    const today = getLocalDateString();

    if (fileDate === today) return; // Same day, no rotation

    // Archive to weekly.md
    log(`[StopSummary] Rotating today.md (${fileDate}) → weekly.md`);
    const archiveHeader = `\n## ${fileDate}\n\n`;
    // Strip the "# Today — date" header before archiving
    const bodyContent = content.replace(/^# Today\s*[-—]\s*\d{4}-\d{2}-\d{2}\n*/, '').trim();

    if (bodyContent) {
      if (!fs.existsSync(WEEKLY_FILE)) {
        fs.writeFileSync(WEEKLY_FILE, `# Weekly Summary\n${archiveHeader}${bodyContent}\n`, 'utf8');
      } else {
        fs.appendFileSync(WEEKLY_FILE, `${archiveHeader}${bodyContent}\n`, 'utf8');
      }
    }

    // Reset today.md for new day
    fs.writeFileSync(TODAY_FILE, `# Today — ${today}\n\n## Sessions\n\n`, 'utf8');
    log(`[StopSummary] Reset today.md for ${today}`);
  } catch (err) {
    log(`[StopSummary] Rotation error (non-blocking): ${err.message}`);
  }
}

/**
 * Check for console.log in modified files (merged from check-console-log.js).
 */
function checkConsoleLogs() {
  if (!isGitRepo()) return;

  try {
    const files = getGitModifiedFiles(['\\.tsx?$', '\\.jsx?$'])
      .filter(f => fs.existsSync(f))
      .filter(f => !EXCLUDED_PATTERNS.some(pattern => pattern.test(f)));

    let hasConsole = false;
    for (const file of files) {
      const content = readFile(file);
      if (content && content.includes('console.log')) {
        log(`[StopSummary] console.log found in ${file}`);
        hasConsole = true;
      }
    }
    if (hasConsole) {
      log('[StopSummary] Remove console.log before committing');
    }
  } catch (err) {
    log(`[StopSummary] console.log check error: ${err.message}`);
  }
}

/**
 * Append a minimal entry to .memory/today.md.
 * Only writes if the mode is Fast or Standard.
 * Heavy mode defers to the full Stop chain (sprint-memory, shared-memory-sync, etc.)
 */
function writeMinimalMemory(mode) {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    // Rotate first, then append
    rotateTodayIfNeeded();

    // Ensure today.md exists with header
    if (!fs.existsSync(TODAY_FILE)) {
      fs.writeFileSync(TODAY_FILE, `# Today — ${getLocalDateString()}\n\n## Sessions\n\n`, 'utf8');
    }

    const timestamp = getTimestamp();
    const entry = `### [Claude Code] ${timestamp}\n- Mode: ${mode}\n- Session ended normally\n\n`;

    fs.appendFileSync(TODAY_FILE, entry, 'utf8');
    log(`[StopSummary] Appended to ${TODAY_FILE}`);
  } catch (err) {
    log(`[StopSummary] Memory write failed (non-blocking): ${err.message}`);
  }
}

function main() {
  const mode = getCurrentMode();

  // Always: check console.log
  checkConsoleLogs();

  // Fast/Standard: write minimal memory with rotation
  // Heavy: skip — the full Stop chain handles memory
  if (mode !== 'heavy') {
    writeMinimalMemory(mode);
  }

  log(`[StopSummary] Done (mode: ${mode})`);
}

// ── stdin entry point ────────────────────────────────────────
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
  try {
    main();
  } catch (err) {
    log(`[StopSummary] Error: ${err.message}`);
  }
  // Always pass through stdin → stdout
  process.stdout.write(stdinData);
  process.exit(0);
});
