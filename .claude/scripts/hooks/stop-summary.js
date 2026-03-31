#!/usr/bin/env node
/**
 * Stop Hook (Always-on):
 * 1. Check for console.log in modified files
 * 2. Rotate .memory/today.md → weekly.md on date change
 * 3. Update ~/.memory/index.md (global project index)
 * 4. Push to remote (if configured)
 *
 * Does NOT write session content to today.md — that's Claude's job
 * (see rules/common/session-memory.md).
 *
 * Cross-platform. Non-blocking: errors never block exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log, getProjectRoot, getGlobalMemoryDir } = require('../lib/utils');

const PROJECT_ROOT = getProjectRoot();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');
const GLOBAL_MEMORY_DIR = getGlobalMemoryDir();
const GLOBAL_INDEX_FILE = path.join(GLOBAL_MEMORY_DIR, 'index.md');

// Exclusions for console.log check
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

function getTimestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

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
 */
function rotateTodayIfNeeded() {
  if (!fs.existsSync(TODAY_FILE)) return;

  try {
    const content = fs.readFileSync(TODAY_FILE, 'utf8');
    if (!content.trim()) return;

    const dateMatch = content.match(/# Today\s*[-—]\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const fileDate = dateMatch[1];
    const today = getLocalDateString();

    if (fileDate === today) return;

    log(`[StopSummary] Rotating today.md (${fileDate}) → weekly.md`);
    const archiveHeader = `\n## ${fileDate}\n\n`;
    const bodyContent = content.replace(/^# Today\s*[-—]\s*\d{4}-\d{2}-\d{2}\n*/, '').trim();

    if (bodyContent) {
      if (!fs.existsSync(WEEKLY_FILE)) {
        fs.writeFileSync(WEEKLY_FILE, `# Weekly Summary\n${archiveHeader}${bodyContent}\n`, 'utf8');
      } else {
        fs.appendFileSync(WEEKLY_FILE, `${archiveHeader}${bodyContent}\n`, 'utf8');
      }
    }

    fs.writeFileSync(TODAY_FILE, `# Today — ${today}\n\n## Sessions\n\n`, 'utf8');
    log(`[StopSummary] Reset today.md for ${today}`);
  } catch (err) {
    log(`[StopSummary] Rotation error (non-blocking): ${err.message}`);
  }
}

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

// ── Main memory logic ────────────────────────────────────────────────

/**
 * Build and write session summary to .memory/today.md.
 *
 * Throttle: per-session ID (same session writes at most once).
 * If no session ID available, falls back to 5-min time throttle.
 */
/**
 * Handle .memory/today.md maintenance — rotation only, NO content writing.
 *
 * All session content is written by Claude in-conversation (see rules/common/session-memory.md).
 * This hook ONLY:
 * 1. Rotates today.md → weekly.md on date change
 * 2. Creates today.md template if missing after rotation
 */
function maintainProjectMemory() {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      log('[StopSummary] .memory/ not found, skipping');
      return;
    }
    rotateTodayIfNeeded();
    log('[StopSummary] Project memory maintained (rotation check only)');
  } catch (err) {
    log(`[StopSummary] Project memory maintenance error (non-blocking): ${err.message}`);
  }
}

/**
 * Update ~/.memory/index.md with current project info.
 * Creates ~/.memory/ if it doesn't exist.
 * Format: markdown table with project name, path, last active, has .memory/
 */
function updateGlobalIndex() {
  try {
    if (!fs.existsSync(GLOBAL_MEMORY_DIR)) {
      fs.mkdirSync(GLOBAL_MEMORY_DIR, { recursive: true });
    }

    const projectName = path.basename(PROJECT_ROOT);
    const hasMemory = fs.existsSync(MEMORY_DIR) ? 'Yes' : 'No';
    const now = getLocalDateString() + ' ' + getTimestamp();

    // Read existing index or create new
    let content = '';
    if (fs.existsSync(GLOBAL_INDEX_FILE)) {
      content = fs.readFileSync(GLOBAL_INDEX_FILE, 'utf8');
    }

    if (!content.includes('| Project |')) {
      // Create new index with header
      content = `# Global Memory Index\n\n| Project | Path | Last Active | Has .memory/ |\n|---------|------|-------------|-------------|\n`;
    }

    // Check if project already has a row — update it
    const escapedPath = PROJECT_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`^\\|[^|]*\\|\\s*${escapedPath}\\s*\\|.*$`, 'm');

    const newRow = `| ${projectName} | ${PROJECT_ROOT} | ${now} | ${hasMemory} |`;

    if (rowRegex.test(content)) {
      content = content.replace(rowRegex, newRow);
    } else {
      content = content.trimEnd() + '\n' + newRow + '\n';
    }

    fs.writeFileSync(GLOBAL_INDEX_FILE, content, 'utf8');
    log(`[StopSummary] Global index updated: ${projectName}`);
  } catch (err) {
    log(`[StopSummary] Global index update failed (non-blocking): ${err.message}`);
  }
}

function main() {
  checkConsoleLogs();

  // Maintain project .memory/ (rotation only, no content writing)
  maintainProjectMemory();

  // Update global memory index (~/.memory/index.md)
  updateGlobalIndex();

  // Push shared memory to remote (if configured)
  try {
    const memorySync = require('../lib/memory-sync');
    if (memorySync.isEnabled()) {
      memorySync.push();
    }
  } catch (err) {
    log(`[StopSummary] Memory sync push skipped: ${err.message}`);
  }

  log('[StopSummary] Done');
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
