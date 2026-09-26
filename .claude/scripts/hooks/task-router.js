#!/usr/bin/env node
/**
 * SessionStart Hook: Task Mode Router
 *
 * Resets this session's mode to Fast and clears its escalation state when a
 * session starts or is cleared; resume and /compact keep the mode. Truncates
 * the mode-trace log and outputs routing instructions.
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

const {
  getCurrentMode, setMode, appendModeTrace, truncateModeTrace, clearEscalationState, SESSION_ID,
} = require('../lib/mode-check');
const { hookSessionId } = require('../lib/utils');
const DEFAULT_MODE = 'fast';

// The hook input and the environment must name the same session; otherwise
// mode state is not per session (as when the missing CLAUDE_SESSION_ID once
// silently shared every session's state).
function sessionIdWarning(input) {
  const fromInput = hookSessionId({ session_id: input.session_id });
  if (fromInput === SESSION_ID) return '';
  return `[TaskRouter] WARNING: hook input names session ${fromInput.slice(0, 8)} but CLAUDE_CODE_SESSION_ID `
    + `${SESSION_ID ? `names ${SESSION_ID.slice(0, 8)}` : 'is unset'}; mode state is not per session.`;
}

function output(msg) {
  process.stdout.write(msg + '\n');
}

function log(msg) {
  console.error(msg);
}

function main(input) {
  // Resume and /compact continue the same session; only a new session or /clear
  // starts from Fast. Writing the kept mode pins it to this session.
  const continuing = input.source === 'resume' || input.source === 'compact';
  const mode = continuing ? getCurrentMode() : DEFAULT_MODE;
  const warning = sessionIdWarning(input);
  setMode(mode);
  if (!continuing) clearEscalationState();
  truncateModeTrace();
  appendModeTrace({
    trigger: 'task-router',
    prev_mode: '',
    next_mode: mode,
    reason: continuing ? `session-${input.source}` : 'session-init',
    matched_signal: null,
    overridden_by_user: false
  });

  // Build model hint
  let modelHint = '';
  try {
    const { getModelSummary } = require('../lib/model-map');
    modelHint = '\n' + getModelSummary({ mode }) +
      '\nWhen spawning agents, pass the `model` parameter matching the current mode. ' +
      'Query: node .claude/scripts/hooks/get-model.js <agent-name>';
  } catch { /* model-map not available */ }

  // Output routing instructions into Claude's context
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);
  output([
    continuing ? `[TaskRouter] Mode: ${label} (kept after ${input.source})` : '[TaskRouter] Mode: Fast (default)',
    ...(warning ? [warning] : []),
    '',
    'ROUTING REMINDER: Before starting work, evaluate the task against these signals:',
    '→ Heavy: auth, oauth, payment, billing, permission, deploy, migration, secret, PII, multi-agent',
    '→ Standard: multi-file change, bugfix, API/server/database/config work, user-visible behavior change',
    '→ Fast: explain code, write docs, single-file small edit, config tweak',
    '',
    'If Standard or Heavy, run: node .claude/scripts/hooks/set-mode.js <mode>',
    'Auto-escalation via pre-tool-escalate.js is also active as a safety net.',
    'Task boundary auto-reset: 5min idle gap resets mode to fast.',
    modelHint,
  ].join('\n'));

  log(`[TaskRouter] Mode ${mode}${continuing ? ` kept after ${input.source}` : ', escalation state cleared'}; trace truncated`);
  if (warning) log(warning);
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
  let input = {};
  try { input = JSON.parse(stdinData) || {}; } catch { /* no hook input */ }
  try {
    main(input);
  } catch (err) {
    log(`[TaskRouter] Error: ${err.message}`);
    setMode(DEFAULT_MODE);
  }
  process.exit(0);
});
