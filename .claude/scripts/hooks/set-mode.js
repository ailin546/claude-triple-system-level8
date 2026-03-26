#!/usr/bin/env node
/**
 * CLI utility to set task mode.
 *
 * Usage:
 *   node .claude/scripts/hooks/set-mode.js fast
 *   node .claude/scripts/hooks/set-mode.js standard
 *   node .claude/scripts/hooks/set-mode.js heavy
 *
 * Called by Claude when it determines the task mode at the start of a task.
 * Also called by post-edit-light.js for automatic escalation.
 *
 * Cross-platform (Windows, macOS, Linux)
 */

'use strict';

const { getCurrentMode, setMode, MODE_LEVELS } = require('../lib/mode-check');

const VALID_MODES = Object.keys(MODE_LEVELS);

const requestedMode = (process.argv[2] || '').toLowerCase();

if (!VALID_MODES.includes(requestedMode)) {
  console.error(`[SetMode] Invalid mode: "${requestedMode}". Valid: ${VALID_MODES.join(', ')}`);
  console.error(`[SetMode] Current mode: ${getCurrentMode()}`);
  process.exit(1);
}

const currentMode = getCurrentMode();
const currentLevel = MODE_LEVELS[currentMode] ?? 0;
const requestedLevel = MODE_LEVELS[requestedMode] ?? 0;

// Only allow escalation (upgrade), never downgrade via this tool
// Downgrade requires explicit user override
if (requestedLevel < currentLevel) {
  console.error(`[SetMode] Cannot downgrade from ${currentMode} to ${requestedMode}. Use user override.`);
  console.error(`[SetMode] Current mode remains: ${currentMode}`);
  process.exit(0);
}

if (requestedLevel === currentLevel) {
  console.error(`[SetMode] Already in ${currentMode} mode.`);
  process.exit(0);
}

setMode(requestedMode);
console.error(`[SetMode] Mode escalated: ${currentMode} → ${requestedMode}`);
process.exit(0);
