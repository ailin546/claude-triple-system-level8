#!/usr/bin/env node
/**
 * CLI utility to set task mode.
 *
 * Usage:
 *   node .claude/scripts/hooks/set-mode.js standard          # escalate only
 *   node .claude/scripts/hooks/set-mode.js heavy             # escalate only
 *   node .claude/scripts/hooks/set-mode.js --reset --reason "..."   # reset to fast
 *   node .claude/scripts/hooks/set-mode.js --reset --reason "..." standard   # reset then set
 *   node .claude/scripts/hooks/set-mode.js --reset --reason "..." --force    # bypass cooldown
 *
 * Escalation: only allows upgrade (fast→standard→heavy), never downgrade.
 *
 * Reset (--reset): resets to fast first, then optionally sets a new mode.
 *   Used at task boundaries when a new, unrelated task starts in the same session.
 *   Requires --reason "..." (≥10 chars) explaining WHY reset is justified.
 *   Cooldown: 1 hour between resets unless --force is passed.
 *   Rationale: --reset was being abused as an escape hatch to bypass evaluation-gate.
 *   Cooldown + reason force Claude to think before resetting, not reflex on every gate block.
 *
 * All mode changes are logged to .claude/logs/mode-trace.jsonl.
 *
 * Cross-platform (Windows, macOS, Linux)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getCurrentMode, setMode, MODE_LEVELS, appendModeTrace, clearEscalationState } = require('../lib/mode-check');

const COOLDOWN_FILE = path.join(os.homedir(), '.claude', 'state', 'set-mode-cooldown.json');
const COOLDOWN_MS = 20 * 60 * 1000; // 20 min — calibrated from 2026-05-01 observation:
//   1h was too long for single-session multi-task work (3+ task boundaries within 1h is common).
//   20min still blocks reflex "reset → commit → reset" cycles within one task arc,
//   but lets genuine task transitions naturally expire.
const MIN_REASON_CHARS = 10;

function safeGetModelSummary(opts) {
  try {
    const { getModelSummary } = require('../lib/model-map');
    return getModelSummary(opts);
  } catch {
    return '';
  }
}

function readCooldown() {
  try {
    const raw = fs.readFileSync(COOLDOWN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCooldown(entry) {
  try {
    fs.mkdirSync(path.dirname(COOLDOWN_FILE), { recursive: true });
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(entry, null, 2));
  } catch (e) {
    console.error(`[SetMode] Warning: cooldown write failed: ${e.message}`);
  }
}

const VALID_MODES = Object.keys(MODE_LEVELS);
const argv = process.argv.slice(2);

// Parse flags
const isReset = argv.includes('--reset');
const isForce = argv.includes('--force');
const reasonIdx = argv.findIndex(a => a === '--reason');
const reason = (reasonIdx >= 0 && reasonIdx + 1 < argv.length) ? argv[reasonIdx + 1] : null;
const modeArg = argv
  .filter((a, i) => a !== '--reset' && a !== '--force' && a !== '--reason' && argv[i - 1] !== '--reason')
  .find(a => !a.startsWith('--'))
  ?.toLowerCase();

if (isReset) {
  // Enforce reason requirement
  if (!reason || reason.length < MIN_REASON_CHARS) {
    console.error(`[SetMode] BLOCK: --reset requires --reason "..." (≥${MIN_REASON_CHARS} chars)`);
    console.error(`[SetMode] Reason explains WHY this reset is justified (new task boundary, not gate-bypass).`);
    console.error(`[SetMode] Example: --reset --reason "starting unrelated bugfix on different module"`);
    console.error(`[SetMode] Example: --reset --reason "doc-only commit, no code touched this turn"`);
    process.exit(2);
  }

  // Forbid suspicious bypass reasons.
  // 2026-05-01: removed "commit" from list — too generic, false-positives on legitimate
  // doc/refactor commit reasons. Remaining words target bypass intent specifically:
  //   - "evaluation" / "eval-gate" / "gate": directly names the gate being bypassed
  //   - "bypass": self-incriminating
  //   - "just a quick": symptom-mode phrase from §编码行为准则 forbidden list
  const lowerReason = reason.toLowerCase();
  const bypassPhrases = ['evaluation', 'eval-gate', 'bypass', 'gate', 'just a quick'];
  const matchedBypass = bypassPhrases.find(p => lowerReason.includes(p));
  if (matchedBypass && !isForce) {
    console.error(`[SetMode] BLOCK: reason looks like gate-bypass ("${matchedBypass}"). If this is genuinely a new task, pass --force. If you're trying to commit without evaluation-loop, that's exactly what this hook prevents — go run /evaluation-loop instead.`);
    process.exit(2);
  }

  // Enforce cooldown
  const cooldown = readCooldown();
  const now = Date.now();
  if (cooldown && cooldown.last_reset_ts && (now - cooldown.last_reset_ts) < COOLDOWN_MS && !isForce) {
    const minutesAgo = Math.round((now - cooldown.last_reset_ts) / 60000);
    const minutesRemaining = Math.round((COOLDOWN_MS - (now - cooldown.last_reset_ts)) / 60000);
    console.error(`[SetMode] BLOCK: --reset cooldown active (last reset ${minutesAgo}min ago: "${cooldown.last_reason || ''}").`);
    console.error(`[SetMode] Cooldown remaining: ${minutesRemaining} minutes.`);
    console.error(`[SetMode] Cooldown is intentional — it prevents reflex resets that bypass evaluation-gate.`);
    console.error(`[SetMode] If this is genuinely a new unrelated task, use --force. Else, finish the current task in its current mode.`);
    process.exit(2);
  }

  const prevMode = getCurrentMode();
  setMode('fast');
  clearEscalationState();
  appendModeTrace({
    trigger: 'set-mode',
    prev_mode: prevMode,
    next_mode: 'fast',
    reason: `manual reset: ${reason}${isForce ? ' [FORCED]' : ''}`,
    matched_signal: null,
    overridden_by_user: true
  });
  writeCooldown({ last_reset_ts: now, last_reason: reason, forced: isForce });
  console.error(`[SetMode] Reset: ${prevMode} → fast (reason: "${reason}"${isForce ? ', forced' : ''})`);
  console.error(`[SetMode] ${safeGetModelSummary({ mode: 'fast' })}`);

  if (!modeArg) {
    process.exit(0);
  }
  // Fall through to set the requested mode after reset
}

if (!modeArg) {
  console.error(`[SetMode] Current mode: ${getCurrentMode()}`);
  console.error(`[SetMode] Usage: set-mode.js <mode> | --reset --reason "..." [mode] [--force]`);
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
  console.error(`[SetMode] Cannot downgrade from ${currentMode} to ${modeArg}. Use --reset --reason "..." for new task.`);
  process.exit(0);
}

if (requestedLevel === currentLevel) {
  console.error(`[SetMode] Already in ${currentMode} mode.`);
  process.exit(0);
}

setMode(modeArg);
appendModeTrace({
  trigger: 'set-mode',
  prev_mode: currentMode,
  next_mode: modeArg,
  reason: 'manual escalation',
  matched_signal: modeArg,
  overridden_by_user: true
});
console.error(`[SetMode] Mode escalated: ${currentMode} → ${modeArg}`);
console.error(`[SetMode] ${safeGetModelSummary({ mode: modeArg })}`);
process.exit(0);
