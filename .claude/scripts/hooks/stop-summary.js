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

function getDateString() {
  return new Date().toISOString().split('T')[0];
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

  // Fast/Standard: write minimal memory only
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
