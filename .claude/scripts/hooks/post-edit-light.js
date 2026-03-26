#!/usr/bin/env node
/**
 * PostToolUse Hook: Lightweight post-edit checks (Always-on)
 *
 * Combines:
 * - Auto-format (delegates to post-edit-format.js logic)
 * - console.log warning (from post-edit-console-warn.js)
 * - Lightweight risk keyword scan
 *
 * Replaces separate post-edit-format.js + post-edit-console-warn.js
 * in the default hook chain. Fails silently — never blocks.
 *
 * Cross-platform (Windows, macOS, Linux)
 */

'use strict';

const path = require('path');
const { readFile, log } = require('../lib/utils');

// Risk keywords that suggest the file may need careful review
const RISK_KEYWORDS = [
  'password', 'secret', 'token', 'api_key', 'apikey', 'api-key',
  'private_key', 'credential', 'DELETE FROM', 'DROP TABLE',
  'rm -rf', 'force push', '--force',
];

// Directories that signal at least Standard mode
const STANDARD_DIRS = [
  '/api/', '/server/', '/database/', '/migrations/', '/auth/',
  '/config/', '/infra/', '/middleware/',
];

// Directories/patterns that signal Heavy mode
const HEAVY_DIRS = [
  '/payment/', '/billing/', '/deploy/', '/permission/',
  '/shared-state/',
];

// File-level risk keywords that signal Standard+
const ESCALATION_KEYWORDS = [
  'auth', 'oauth', 'permission', 'billing', 'payment',
  'deploy', 'migration', 'secret',
];

const MAX_STDIN = 1024 * 1024;

/**
 * Core logic — runs format + console.log check + risk scan.
 */
function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path;
    if (!filePath) return rawInput;

    // ── 1. Auto-format (delegate to existing formatter) ──
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      try {
        const formatter = require('./post-edit-format.js');
        if (typeof formatter.run === 'function') {
          formatter.run(rawInput);
        }
      } catch {
        // Formatter not available — non-blocking
      }
    }

    // ── 2. console.log warning ──
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      const content = readFile(filePath);
      if (content) {
        const lines = content.split('\n');
        const matches = [];
        lines.forEach((line, idx) => {
          if (/console\.log/.test(line)) {
            matches.push((idx + 1) + ': ' + line.trim());
          }
        });
        if (matches.length > 0) {
          log(`[PostEditLight] console.log found in ${filePath}`);
          matches.slice(0, 3).forEach(m => log(`  ${m}`));
        }
      }
    }

    // ── 3. Risk keyword scan ──
    const content = readFile(filePath);
    if (content) {
      const foundRisks = RISK_KEYWORDS.filter(kw =>
        content.toLowerCase().includes(kw.toLowerCase())
      );
      if (foundRisks.length > 0) {
        log(`[PostEditLight] Risk keywords in ${filePath}: ${foundRisks.join(', ')}`);
      }
    }

    // ── 4. Auto-escalate mode based on file path and content ──
    try {
      const { getCurrentMode, setMode, MODE_LEVELS } = require('../lib/mode-check');
      const currentMode = getCurrentMode();
      const normalizedPath = filePath.replace(/\\/g, '/');

      let targetMode = null;

      // Check Heavy directories
      if (HEAVY_DIRS.some(d => normalizedPath.includes(d))) {
        targetMode = 'heavy';
      }
      // Check Standard directories
      else if (STANDARD_DIRS.some(d => normalizedPath.includes(d))) {
        targetMode = 'standard';
      }
      // Check escalation keywords in file path
      else if (ESCALATION_KEYWORDS.some(kw => normalizedPath.toLowerCase().includes(kw))) {
        targetMode = 'standard';
      }

      // Only escalate, never downgrade
      if (targetMode) {
        const currentLevel = MODE_LEVELS[currentMode] ?? 0;
        const targetLevel = MODE_LEVELS[targetMode] ?? 0;
        if (targetLevel > currentLevel) {
          setMode(targetMode);
          log(`[PostEditLight] Mode auto-escalated: ${currentMode} → ${targetMode} (triggered by ${filePath})`);
        }
      }
    } catch {
      // mode-check not available — non-blocking
    }
  } catch {
    // Invalid input — pass through silently
  }

  return rawInput;
}

// ── stdin entry point ────────────────────────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    data = run(data);
    process.stdout.write(data);
    process.exit(0);
  });
}

module.exports = { run };
