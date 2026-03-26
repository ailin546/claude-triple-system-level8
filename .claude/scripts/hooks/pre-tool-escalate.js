#!/usr/bin/env node
/**
 * PreToolUse Hook: Auto-escalate mode before tool execution (Always-on)
 *
 * Checks the tool input (Bash command or file path) for risk signals
 * and escalates the task mode BEFORE the tool runs, ensuring that
 * Standard+/Heavy hooks are active when they're first needed.
 *
 * This closes the gap where:
 * - post-edit-light.js only triggers after Edit (too late for Bash)
 * - task-router.js only runs at SessionStart (no task context yet)
 * - set-mode.js requires Claude to remember to call it (unreliable)
 *
 * Signals checked:
 * - Bash commands involving high-risk tools/directories
 * - Edit/Write targets in high-risk directories
 *
 * Non-blocking: pass-through on error, never blocks tool execution.
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const MAX_STDIN = 1024 * 1024;

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

// File path patterns → Standard
const STANDARD_PATH_SEGMENTS = [
  '/api/', '/server/', '/database/', '/migrations/', '/auth/',
  '/config/', '/infra/', '/middleware/',
];

// File path patterns → Heavy
const HEAVY_PATH_SEGMENTS = [
  '/payment/', '/billing/', '/deploy/', '/permission/',
  '/shared-state/',
];

// ── Main logic ───────────────────────────────────────────────

function detectEscalation(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Check Bash commands
  if (toolName === 'Bash' || toolName === 'bash') {
    const cmd = toolInput.command || '';
    if (!cmd) return null;

    for (const pattern of HEAVY_BASH_PATTERNS) {
      if (pattern.test(cmd)) return 'heavy';
    }
    for (const pattern of STANDARD_BASH_PATTERNS) {
      if (pattern.test(cmd)) return 'standard';
    }
  }

  // Check Edit/Write file paths
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'edit' || toolName === 'write') {
    const filePath = (toolInput.file_path || '').replace(/\\/g, '/');
    if (!filePath) return null;

    for (const seg of HEAVY_PATH_SEGMENTS) {
      if (filePath.includes(seg)) return 'heavy';
    }
    for (const seg of STANDARD_PATH_SEGMENTS) {
      if (filePath.includes(seg)) return 'standard';
    }
  }

  return null;
}

// ── stdin entry point ────────────────────────────────────────

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
    const targetMode = detectEscalation(input);

    if (targetMode) {
      const { getCurrentMode, setMode, MODE_LEVELS } = require('../lib/mode-check');
      const currentMode = getCurrentMode();
      const currentLevel = MODE_LEVELS[currentMode] ?? 0;
      const targetLevel = MODE_LEVELS[targetMode] ?? 0;

      if (targetLevel > currentLevel) {
        setMode(targetMode);
        console.error(`[PreToolEscalate] Mode auto-escalated: ${currentMode} → ${targetMode}`);
      }
    }
  } catch {
    // Parse error or mode-check unavailable — pass through
  }

  // Always pass through original input unchanged
  process.stdout.write(data);
  process.exit(0);
});
