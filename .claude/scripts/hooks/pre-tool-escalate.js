#!/usr/bin/env node
/**
 * PreToolUse Hook: Auto-escalate mode before tool execution (Always-on)
 *
 * Three escalation mechanisms in one hook:
 * 1. Risk signal detection — Bash commands and file paths matching known patterns
 * 2. Cross-file accumulation — 3+ unique files → Standard, 6+ → Heavy
 * 3. Task boundary detection — 5min idle gap → reset to fast, then re-evaluate
 *
 * All mode changes are logged to .claude/logs/mode-trace.jsonl for observability.
 *
 * Non-blocking: pass-through on error, never blocks tool execution.
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const MAX_STDIN = 1024 * 1024;

// ── Thresholds ───────────────────────────────────────────────

const CROSS_FILE_STANDARD = 3;
const CROSS_FILE_HEAVY = 6;
const TASK_BOUNDARY_MS = (parseInt(process.env.TASK_BOUNDARY_MINUTES, 10) || 5) * 60 * 1000;

// ── Risk signal definitions ──────────────────────────────────

// Bash command patterns → Standard
const STANDARD_BASH_PATTERNS = [
  /\bgit\s+(add|commit|checkout|switch|merge|rebase|cherry-pick)\b/,
  /\bnpm\s+(run\s+build|run\s+dev|install|ci)\b/,
  /\bpip\s+install\b/,
  /\byarn\s+(add|install)\b/,
  /\bpnpm\s+(add|install)\b/,
  /\bmkdir\b.*\b(api|server|database|migrations|auth|config|infra)\b/,
];

// Bash command patterns → Heavy
const HEAVY_BASH_PATTERNS = [
  /\bgit\s+push\b/,
  /\b(deploy|terraform|kubectl|helm)\b/,
  /\bnpm\s+publish\b/,
  /\bdocker\s+push\b/,
  /\b(migrate|prisma\s+migrate)\b/,
  /\b(payment|billing|auth|oauth|secret|token)\b.*\b(create|update|delete|set|rotate)\b/,
];

// Directory names that signal Standard mode
const STANDARD_DIR_NAMES = [
  'api', 'server', 'database', 'migrations',
  'config', 'infra', 'middleware',
];

// Directory names that signal Heavy mode
const HEAVY_DIR_NAMES = [
  'auth', 'payment', 'billing', 'deploy', 'permission',
  'shared-state', 'identity', 'oauth',
];

/**
 * Check if a normalized path contains a directory segment.
 */
function pathContainsDir(normalizedPath, dirName) {
  return normalizedPath.includes(`/${dirName}/`) || normalizedPath.startsWith(`${dirName}/`);
}

// ── Signal detection ─────────────────────────────────────────

/**
 * Detect escalation target from a single tool input.
 * Returns { mode, signal } or null.
 */
function detectEscalation(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Check Bash commands
  if (toolName === 'Bash' || toolName === 'bash') {
    const cmd = toolInput.command || '';
    if (!cmd) return null;

    for (const pattern of HEAVY_BASH_PATTERNS) {
      if (pattern.test(cmd)) return { mode: 'heavy', signal: `bash: ${cmd.slice(0, 80)}` };
    }
    for (const pattern of STANDARD_BASH_PATTERNS) {
      if (pattern.test(cmd)) return { mode: 'standard', signal: `bash: ${cmd.slice(0, 80)}` };
    }
  }

  // Check Edit/Write file paths
  if (/^(Edit|Write)$/i.test(toolName)) {
    const filePath = (toolInput.file_path || '').replace(/\\/g, '/');
    if (!filePath) return null;

    for (const dir of HEAVY_DIR_NAMES) {
      if (pathContainsDir(filePath, dir)) return { mode: 'heavy', signal: `path: ${filePath}` };
    }
    for (const dir of STANDARD_DIR_NAMES) {
      if (pathContainsDir(filePath, dir)) return { mode: 'standard', signal: `path: ${filePath}` };
    }

    // Content-level: data source SSOT check (invariant #1)
    // Editing frontend files that introduce exchange proxy or direct API calls
    // → auto-escalate to Standard (triggers /plan recommendation)
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      const content = toolInput.new_string || toolInput.content || '';
      const SSOT_PATTERNS = [
        /\/proxy-(binance|okx|bybit|gate|bitget|mexc|kucoin|coinex|hyperliquid)/,
        /api\.binance\.com|fapi\.binance\.com|www\.okx\.com|api\.bybit\.com/,
        /api\.bitget\.com|api\.gateio\.ws|api\.huobi\.pro/,
      ];
      for (const pat of SSOT_PATTERNS) {
        if (pat.test(content)) {
          return { mode: 'standard', signal: `SSOT: exchange data source in ${filePath.split('/').pop()}` };
        }
      }
    }
  }

  return null;
}

/**
 * Extract file path from tool input (Edit/Write targets).
 */
function extractFilePath(input) {
  const toolName = input.tool_name || '';
  if (/^(Edit|Write)$/i.test(toolName)) {
    return (input.tool_input?.file_path || '').replace(/\\/g, '/') || null;
  }
  return null;
}

// ── Main logic ───────────────────────────────────────────────

let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const {
      getCurrentMode, setMode, MODE_LEVELS,
      appendModeTrace,
      getEscalationState, setEscalationState
    } = require('../lib/mode-check');

    const escState = getEscalationState();
    const now = Date.now();
    let currentMode = getCurrentMode();

    // ── Task boundary detection ──
    // If idle for > TASK_BOUNDARY_MS, reset to fast and clear file tracking
    if (escState.lastToolUseAt && (now - escState.lastToolUseAt) > TASK_BOUNDARY_MS) {
      const prevMode = currentMode;
      if (prevMode !== 'fast') {
        setMode('fast');
        appendModeTrace({
          trigger: 'pre-tool-escalate',
          prev_mode: prevMode,
          next_mode: 'fast',
          reason: `task-boundary: idle ${Math.round((now - escState.lastToolUseAt) / 60000)}min`,
          matched_signal: null,
          overridden_by_user: false
        });
        console.error(`[PreToolEscalate] Task boundary detected (idle ${Math.round((now - escState.lastToolUseAt) / 60000)}min). Mode reset: ${prevMode} → fast`);
        try {
          const { getModelSummary } = require('../lib/model-map');
          console.error(`[PreToolEscalate] ${getModelSummary({ mode: 'fast' })}`);
        } catch { /* model-map not available */ }
        currentMode = 'fast';
      }
      // Clear file tracking for new task
      escState.filesTracked = [];
    }

    // ── Track unique files ──
    const filePath = extractFilePath(input);
    if (filePath && !escState.filesTracked.includes(filePath)) {
      escState.filesTracked.push(filePath);
    }

    // ── Determine target mode from all signals ──
    let targetMode = null;
    let targetSignal = null;
    let targetReason = null;

    // 1. Risk signal detection (highest priority)
    const riskResult = detectEscalation(input);
    if (riskResult) {
      targetMode = riskResult.mode;
      targetSignal = riskResult.signal;
      targetReason = `risk-signal: ${riskResult.signal}`;
    }

    // 2. Cross-file accumulation (only upgrade if risk didn't already set higher)
    const fileCount = escState.filesTracked.length;
    if (fileCount >= CROSS_FILE_HEAVY) {
      if (!targetMode || MODE_LEVELS[targetMode] < MODE_LEVELS.heavy) {
        targetMode = 'heavy';
        targetSignal = `${fileCount} unique files`;
        targetReason = `cross-file: ${fileCount} files touched (threshold: ${CROSS_FILE_HEAVY})`;
      }
    } else if (fileCount >= CROSS_FILE_STANDARD) {
      if (!targetMode || MODE_LEVELS[targetMode] < MODE_LEVELS.standard) {
        targetMode = 'standard';
        targetSignal = `${fileCount} unique files`;
        targetReason = `cross-file: ${fileCount} files touched (threshold: ${CROSS_FILE_STANDARD})`;
      }
    }

    // ── Apply escalation (only upgrade, never downgrade) ──
    if (targetMode) {
      const currentLevel = MODE_LEVELS[currentMode] ?? 0;
      const targetLevel = MODE_LEVELS[targetMode] ?? 0;

      if (targetLevel > currentLevel) {
        setMode(targetMode);
        appendModeTrace({
          trigger: 'pre-tool-escalate',
          prev_mode: currentMode,
          next_mode: targetMode,
          reason: targetReason,
          matched_signal: targetSignal,
          overridden_by_user: false
        });
        console.error(`[PreToolEscalate] Mode escalated: ${currentMode} → ${targetMode} (${targetReason})`);
        try {
          const { getModelSummary } = require('../lib/model-map');
          console.error(`[PreToolEscalate] ${getModelSummary({ mode: targetMode })}`);
        } catch { /* model-map not available */ }
      }
    }

    // ── Update escalation state ──
    escState.lastToolUseAt = now;
    setEscalationState(escState);

  } catch {
    // Parse error or mode-check unavailable — pass through
  }

  // Always pass through original input unchanged
  process.stdout.write(data);
  process.exit(0);
});
