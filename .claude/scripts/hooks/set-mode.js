#!/usr/bin/env node
/**
 * CLI utility to set task mode.
 *
 * Usage:
 *   node .claude/scripts/hooks/set-mode.js standard     # escalate only
 *   node .claude/scripts/hooks/set-mode.js heavy        # escalate only
 *   node .claude/scripts/hooks/set-mode.js --reset      # reset to fast (new task boundary)
 *   node .claude/scripts/hooks/set-mode.js --reset standard  # reset then set
 *
 * Escalation: only allows upgrade (fast→standard→heavy), never downgrade.
 * Reset (--reset): resets to fast first, then optionally sets a new mode.
 *   Used at task boundaries when a new, unrelated task starts in the same session.
 *
 * Cross-platform (Windows, macOS, Linux)
 */

'use strict';

const { getCurrentMode, setMode, MODE_LEVELS } = require('../lib/mode-check');

const VALID_MODES = Object.keys(MODE_LEVELS);
const args = process.argv.slice(2).map(a => a.toLowerCase());

// Handle --reset flag
const isReset = args.includes('--reset');
const modeArg = args.find(a => a !== '--reset');

if (isReset) {
  const prevMode = getCurrentMode();
  setMode('fast');
  console.error(`[SetMode] Reset: ${prevMode} → fast (new task boundary)`);

  if (!modeArg) {
    process.exit(0);
  }
  // Fall through to set the requested mode after reset
}

if (!modeArg) {
  console.error(`[SetMode] Current mode: ${getCurrentMode()}`);
  console.error(`[SetMode] Usage: set-mode.js <mode> | --reset [mode]`);
  process.exit(1);
}

if (!VALID_MODES.includes(modeArg)) {
  console.error(`[SetMode] Invalid mode: "${modeArg}". Valid: ${VALID_MODES.join(', ')}`);
  process.exit(1);
}

const currentMode = getCurrentMode();
const currentLevel = MODE_LEVELS[currentMode] ?? 0;
const requestedLevel = MODE_LEVELS[modeArg] ?? 0;

// Only allow escalation (upgrade), never downgrade without --reset
if (requestedLevel < currentLevel) {
  console.error(`[SetMode] Cannot downgrade from ${currentMode} to ${modeArg}. Use --reset for new task.`);
  process.exit(0);
}

if (requestedLevel === currentLevel) {
  console.error(`[SetMode] Already in ${currentMode} mode.`);
  process.exit(0);
}

setMode(modeArg);
console.error(`[SetMode] Mode escalated: ${currentMode} → ${modeArg}`);
process.exit(0);
