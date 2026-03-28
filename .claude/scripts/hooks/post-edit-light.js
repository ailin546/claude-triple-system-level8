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

    // ── 2. Read file once for all checks ──
    const content = readFile(filePath);

    // ── 3. console.log warning ──
    if (/\.(ts|tsx|js|jsx)$/.test(filePath) && content) {
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

    // ── 4. Risk keyword scan ──
    if (content) {
      const foundRisks = RISK_KEYWORDS.filter(kw =>
        content.toLowerCase().includes(kw.toLowerCase())
      );
      if (foundRisks.length > 0) {
        log(`[PostEditLight] Risk keywords in ${filePath}: ${foundRisks.join(', ')}`);
      }
    }

    // Note: Mode auto-escalation is handled by pre-tool-escalate.js (SSOT)
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
