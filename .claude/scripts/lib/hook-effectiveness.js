#!/usr/bin/env node
/**
 * Hook Effectiveness Logger
 *
 * Shared utility for hooks to record effectiveness events.
 * Events are stored in .claude/logs/hook-effectiveness.jsonl.
 *
 * Used by: careful-guard, drift-detector, quality-gate, pre-tool-escalate
 *
 * Non-blocking: all writes are best-effort.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getProjectRoot } = require('./project-root');
const PROJECT_ROOT = getProjectRoot();
const LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'logs', 'hook-effectiveness.jsonl');
const MAX_LINES = 2000;

/**
 * Record a hook effectiveness event.
 *
 * @param {{ hook: string, action: string, target?: string, detail?: string }} entry
 */
function recordEvent({ hook, action, target, detail }) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      hook,
      action,
      target: target || null,
      detail: detail || null,
    }) + '\n';

    fs.appendFileSync(LOG_PATH, line, 'utf8');
  } catch {
    // Non-blocking
  }
}

/**
 * Truncate log if it exceeds MAX_LINES. Keeps last 1000 lines.
 */
function truncateLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length <= MAX_LINES) return;
    const kept = lines.slice(-1000).join('\n') + '\n';
    fs.writeFileSync(LOG_PATH, kept, 'utf8');
  } catch {
    // Non-blocking
  }
}

module.exports = { recordEvent, truncateLog, LOG_PATH };
