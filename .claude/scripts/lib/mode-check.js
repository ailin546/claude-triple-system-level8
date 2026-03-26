#!/usr/bin/env node
/**
 * Mode check utility for ECC hooks.
 *
 * Reads the current task mode from .claude/.task-mode
 * and provides helpers for hooks to decide whether to run.
 *
 * Usage in hooks:
 *   const { getCurrentMode, requireMode } = require('../lib/mode-check');
 *   if (!requireMode('standard')) { process.exit(0); }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');

const MODE_LEVELS = { fast: 0, standard: 1, heavy: 2 };

/**
 * Get current task mode. Defaults to 'fast' if file missing.
 * @returns {'fast' | 'standard' | 'heavy'}
 */
function getCurrentMode() {
  try {
    const mode = fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
    if (mode in MODE_LEVELS) return mode;
    return 'fast';
  } catch {
    return 'fast';
  }
}

/**
 * Check if current mode meets the minimum required level.
 * @param {'fast' | 'standard' | 'heavy'} minMode
 * @returns {boolean}
 */
function requireMode(minMode) {
  const current = getCurrentMode();
  const currentLevel = MODE_LEVELS[current] ?? 0;
  const requiredLevel = MODE_LEVELS[minMode] ?? 0;
  return currentLevel >= requiredLevel;
}

/**
 * Set the task mode.
 * @param {'fast' | 'standard' | 'heavy'} mode
 */
function setMode(mode) {
  try {
    const dir = path.dirname(MODE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MODE_FILE, mode, 'utf8');
  } catch {
    // Non-blocking
  }
}

module.exports = { getCurrentMode, requireMode, setMode, MODE_LEVELS };
