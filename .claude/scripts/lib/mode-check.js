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

// ── Mode Trace ───────────────────────────────────────────────

const MODE_TRACE_PATH = path.join(PROJECT_ROOT, '.claude', 'logs', 'mode-trace.jsonl');

/**
 * Append a structured mode-change entry to the trace log.
 * Non-blocking: silently ignores errors.
 *
 * @param {{ trigger: string, prev_mode: string, next_mode: string, reason: string, matched_signal: string|null, overridden_by_user: boolean }} entry
 */
function appendModeTrace({ trigger, prev_mode, next_mode, reason, matched_signal, overridden_by_user }) {
  try {
    const dir = path.dirname(MODE_TRACE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      trigger,
      prev_mode,
      next_mode,
      reason,
      matched_signal: matched_signal || null,
      overridden_by_user: overridden_by_user || false
    }) + '\n';
    fs.appendFileSync(MODE_TRACE_PATH, line, 'utf8');
  } catch {
    // Non-blocking
  }
}

/**
 * Truncate trace file if it exceeds maxLines. Keeps the last keepLines.
 * Called at session init to prevent unbounded growth.
 *
 * @param {number} [maxLines=500]
 * @param {number} [keepLines=200]
 */
function truncateModeTrace(maxLines = 500, keepLines = 200) {
  try {
    if (!fs.existsSync(MODE_TRACE_PATH)) return;
    const content = fs.readFileSync(MODE_TRACE_PATH, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length <= maxLines) return;
    const kept = lines.slice(-keepLines).join('\n') + '\n';
    fs.writeFileSync(MODE_TRACE_PATH, kept, 'utf8');
  } catch {
    // Non-blocking
  }
}

// ── Escalation State ─────────────────────────────────────────

const ESCALATION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', '.escalation-state.json');

/**
 * Read the escalation state (file tracking, last tool use time).
 * @returns {{ filesTracked: string[], lastToolUseAt: number|null }}
 */
function getEscalationState() {
  try {
    return JSON.parse(fs.readFileSync(ESCALATION_STATE_PATH, 'utf8'));
  } catch {
    return { filesTracked: [], lastToolUseAt: null };
  }
}

/**
 * Write the escalation state atomically.
 * @param {{ filesTracked: string[], lastToolUseAt: number|null }} state
 */
function setEscalationState(state) {
  try {
    const dir = path.dirname(ESCALATION_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ESCALATION_STATE_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // Non-blocking
  }
}

/**
 * Clear escalation state (used at session init and --reset).
 */
function clearEscalationState() {
  try {
    if (fs.existsSync(ESCALATION_STATE_PATH)) fs.unlinkSync(ESCALATION_STATE_PATH);
  } catch {
    // Non-blocking
  }
}

module.exports = {
  getCurrentMode, requireMode, setMode, MODE_LEVELS,
  appendModeTrace, truncateModeTrace, MODE_TRACE_PATH,
  getEscalationState, setEscalationState, clearEscalationState, ESCALATION_STATE_PATH
};
