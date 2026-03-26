#!/usr/bin/env node
/**
 * SessionStart Hook: Task Mode Router
 *
 * Resets mode to Fast at session start, clears escalation state,
 * truncates mode-trace log, and outputs routing instructions.
 *
 * Mode escalation happens through three mechanisms:
 * 1. Claude evaluates routing signals and calls set-mode.js (CLAUDE.md rule)
 * 2. pre-tool-escalate.js detects risk signals + cross-file accumulation (automatic)
 * 3. pre-tool-escalate.js detects task boundaries via idle gap (automatic reset)
 *
 * Cross-platform (Windows, macOS, Linux)
 * Non-blocking: errors fall back to Fast mode.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');
const DEFAULT_MODE = 'fast';

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

function output(msg) {
  process.stdout.write(msg + '\n');
}

function log(msg) {
  console.error(msg);
}

function main() {
  // Always reset to Fast at session start
  writeMode(DEFAULT_MODE);

  // Clear escalation state and truncate trace log
  try {
    const { appendModeTrace, truncateModeTrace, clearEscalationState } = require('../lib/mode-check');
    clearEscalationState();
    truncateModeTrace();
    appendModeTrace({
      trigger: 'task-router',
      prev_mode: '',
      next_mode: 'fast',
      reason: 'session-init',
      matched_signal: null,
      overridden_by_user: false
    });
  } catch {
    // mode-check not available — continue without trace
  }

  // Output routing instructions into Claude's context
  output([
    '[TaskRouter] Mode: Fast (default)',
    '',
    'ROUTING REMINDER: Before starting work, evaluate the task against these signals:',
    '→ Heavy: auth, oauth, payment, billing, permission, deploy, migration, secret, PII, multi-agent',
    '→ Standard: multi-file change, bugfix, API/server/database/config work, user-visible behavior change',
    '→ Fast: explain code, write docs, single-file small edit, config tweak',
    '',
    'If Standard or Heavy, run: node .claude/scripts/hooks/set-mode.js <mode>',
    'Auto-escalation via pre-tool-escalate.js is also active as a safety net.',
    'Task boundary auto-reset: 5min idle gap resets mode to fast.',
  ].join('\n'));

  log('[TaskRouter] Initialized mode: fast, escalation state cleared, trace truncated');
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
    writeMode(DEFAULT_MODE);
  }
  process.exit(0);
});
