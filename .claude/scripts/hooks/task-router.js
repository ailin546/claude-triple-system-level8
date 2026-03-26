#!/usr/bin/env node
/**
 * SessionStart Hook: Task Mode Router
 *
 * Determines Fast / Standard / Heavy mode based on routing signals.
 * Writes mode to .claude/.task-mode so other hooks can check it.
 * Outputs mode summary to stdout (injected into Claude context).
 *
 * Cross-platform (Windows, macOS, Linux)
 * Non-blocking: errors fall back to Fast mode.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');

// Default to Fast
const DEFAULT_MODE = 'fast';

/**
 * Read the current mode from the mode file.
 * Returns null if no mode file exists.
 */
function readCurrentMode() {
  try {
    return fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Write mode to file so other hooks can check it.
 */
function writeMode(mode) {
  try {
    const dir = path.dirname(MODE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MODE_FILE, mode, 'utf8');
  } catch (err) {
    console.error(`[TaskRouter] Failed to write mode file: ${err.message}`);
  }
}

/**
 * Output to Claude context (stdout).
 */
function output(msg) {
  process.stdout.write(msg + '\n');
}

function log(msg) {
  console.error(msg);
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  // On SessionStart, we don't have task context yet.
  // Set default mode to Fast. The mode摘要 rule in CLAUDE.md
  // will guide Claude to re-evaluate at task start.
  const currentMode = readCurrentMode();

  if (!currentMode) {
    // First session or mode file missing — default to Fast
    writeMode(DEFAULT_MODE);
    output('[TaskRouter] Mode: Fast (default) — will re-evaluate when task begins');
    log('[TaskRouter] Initialized mode: fast');
  } else {
    // Mode file exists from previous session — reset to Fast for new session
    writeMode(DEFAULT_MODE);
    output(`[TaskRouter] Mode: Fast (reset for new session, previous: ${currentMode})`);
    log(`[TaskRouter] Reset mode to fast (was: ${currentMode})`);
  }
}

// ── stdin entry point (hook protocol) ────────────────────────
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
    log(`[TaskRouter] Error: ${err.message}`);
    // Fallback: write Fast mode
    writeMode(DEFAULT_MODE);
  }
  process.exit(0);
});
