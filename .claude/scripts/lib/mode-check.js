#!/usr/bin/env node
/**
 * Mode check utility for ECC hooks.
 *
 * Reads the current session's task mode (state layout below)
 * and provides helpers for hooks to decide whether to run.
 *
 * Usage in hooks:
 *   const { getCurrentMode, requireMode } = require('../lib/mode-check');
 *   if (!requireMode('standard')) { process.exit(0); }
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getProjectRoot } = require('./project-root');
const { hookSessionId } = require('./utils');
const PROJECT_ROOT = getProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

// Mode, escalation state and the set-mode cooldown belong to one session:
// `.claude/.mode-state/<session id>.*`. Without a session id (a script run in a
// plain terminal, another agent) the project-level files are used.
const SESSION_ID = hookSessionId(null);
const MODE_STATE_DIR = path.join(CLAUDE_DIR, '.mode-state');
const PROJECT_MODE_FILE = path.join(CLAUDE_DIR, '.task-mode');
const sessionFile = (suffix, projectLevel) =>
  (SESSION_ID ? path.join(MODE_STATE_DIR, `${SESSION_ID}${suffix}`) : projectLevel);
const MODE_FILE = sessionFile('.mode', PROJECT_MODE_FILE);
const STALE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const MODE_LEVELS = { fast: 0, standard: 1, heavy: 2 };

function readModeFile(file) {
  try {
    const mode = fs.readFileSync(file, 'utf8').trim().toLowerCase();
    return mode in MODE_LEVELS ? mode : null;
  } catch {
    return null;
  }
}

/**
 * Get the session's task mode. A session that has not set one yet (it started
 * before modes were per session) reads the project-level mode; default 'fast'.
 * @returns {'fast' | 'standard' | 'heavy'}
 */
function getCurrentMode() {
  return readModeFile(MODE_FILE) || readModeFile(PROJECT_MODE_FILE) || 'fast';
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
    const first = !fs.existsSync(MODE_FILE);
    fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
    fs.writeFileSync(MODE_FILE, mode, 'utf8');
    if (first && SESSION_ID) pruneStaleSessions();
  } catch {
    // Non-blocking
  }
}

// Remove the state of sessions that have touched none of their files for
// STALE_SESSION_MS (an active session refreshes its escalation state on every
// tool call).
function pruneStaleSessions() {
  const names = fs.readdirSync(MODE_STATE_DIR);
  const newest = new Map();
  for (const name of names) {
    const id = name.split('.')[0];
    try {
      const mtime = fs.statSync(path.join(MODE_STATE_DIR, name)).mtimeMs;
      newest.set(id, Math.max(newest.get(id) || 0, mtime));
    } catch { /* removed meanwhile */ }
  }
  const cutoff = Date.now() - STALE_SESSION_MS;
  for (const name of names) {
    if ((newest.get(name.split('.')[0]) || 0) >= cutoff) continue;
    try { fs.unlinkSync(path.join(MODE_STATE_DIR, name)); } catch { /* another session pruned it */ }
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
      session_id: SESSION_ID || null,
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

const ESCALATION_STATE_PATH = sessionFile('.escalation.json', path.join(CLAUDE_DIR, '.escalation-state.json'));
const SET_MODE_COOLDOWN_PATH = sessionFile('.cooldown.json', path.join(os.homedir(), '.claude', 'state', 'set-mode-cooldown.json'));

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
  getEscalationState, setEscalationState, clearEscalationState, ESCALATION_STATE_PATH,
  SESSION_ID, SET_MODE_COOLDOWN_PATH
};
