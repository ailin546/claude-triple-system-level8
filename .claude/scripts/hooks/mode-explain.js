#!/usr/bin/env node
/**
 * mode-explain.js — Show current task mode + recent mode change history.
 *
 * Reads:
 *   - .claude/.task-mode (current mode)
 *   - .claude/logs/mode-trace.jsonl (audit log of all mode changes)
 *
 * Usage:
 *   node ~/.claude/scripts/hooks/mode-explain.js          # last 5 changes
 *   node ~/.claude/scripts/hooks/mode-explain.js -n 20    # last N changes
 *   node ~/.claude/scripts/hooks/mode-explain.js --all    # full history
 *
 * 2026-05-20: Created to address Codex N1 "mode state not explainable".
 *   5 entry points can change mode (task-router / set-mode / pre-tool-escalate /
 *   user-prompt-classify / idle-reset). Without this tool, "who changed mode,
 *   when, why" requires reading raw JSONL manually.
 */

const fs = require('fs');
const path = require('path');
const { getProjectRoot } = require('../lib/project-root');

const PROJECT_ROOT = getProjectRoot();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');
const TRACE_FILE = path.join(PROJECT_ROOT, '.claude', 'logs', 'mode-trace.jsonl');

function parseArgs(argv) {
  const args = { n: 5, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '-n' && argv[i + 1]) { args.n = parseInt(argv[++i], 10) || 5; }
  }
  return args;
}

function readCurrentMode() {
  try { return fs.readFileSync(MODE_FILE, 'utf8').trim(); }
  catch { return '(unset → fast default)'; }
}

function readTrace() {
  if (!fs.existsSync(TRACE_FILE)) return [];
  const lines = fs.readFileSync(TRACE_FILE, 'utf8').split('\n').filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function formatRow(entry) {
  const ts = entry.timestamp ? entry.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '?';
  const prev = entry.prev_mode || '∅';
  const next = entry.next_mode || '?';
  const arrow = prev === next ? `[${next}]` : `${prev} → ${next}`;
  const trigger = entry.trigger || '?';
  const reason = entry.reason || '';
  const signal = entry.matched_signal ? ` [signal: ${entry.matched_signal}]` : '';
  const userOverride = entry.overridden_by_user ? ' (user override)' : '';
  return `${ts}  ${arrow.padEnd(20)} via ${trigger.padEnd(22)} ${reason}${signal}${userOverride}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = readCurrentMode();
  const trace = readTrace();

  console.log(`## Current mode: ${current}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Trace file:   ${TRACE_FILE} (${trace.length} entries)`);
  console.log('');

  if (!trace.length) {
    console.log('No mode-trace entries yet. SessionStart will populate it.');
    return;
  }

  const slice = args.all ? trace : trace.slice(-args.n);
  console.log(`## Recent mode changes (last ${slice.length}):`);
  console.log('');
  for (const entry of slice) {
    console.log('  ' + formatRow(entry));
  }
  console.log('');
  console.log('## How to read');
  console.log('  trigger=task-router        → SessionStart reset to fast');
  console.log('  trigger=set-mode           → manual via Claude/user');
  console.log('  trigger=pre-tool-escalate  → auto upgrade from risk signal');
  console.log('  trigger=user-prompt-classify → fix/bug keyword auto-upgrade');
  console.log('  trigger=idle-reset         → 5min idle gap reset to fast');
}

try { main(); } catch (err) {
  console.error(`mode-explain error: ${err.message}`);
  process.exit(1);
}
