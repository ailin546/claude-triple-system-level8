#!/usr/bin/env node
/**
 * Careful Guard — Destructive Command Interceptor
 *
 * PreToolUse hook for Bash that blocks dangerous commands like rm -rf,
 * DROP TABLE, git push --force, etc.
 *
 * Inspired by gstack's /careful mechanism.
 *
 * Toggle: /careful off to disable, /careful on to re-enable.
 * State stored in .claude/.careful-enabled (absent = enabled by default).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', '.careful-enabled');

/**
 * Dangerous command patterns with descriptions.
 * Each pattern is tested against the full command string.
 */
const DANGEROUS_PATTERNS = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/, desc: 'rm -rf (recursive force delete)' },
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\/(?!\btmp\b)/, desc: 'rm -r on root-level path' },
  { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, desc: 'SQL DROP statement' },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, desc: 'SQL TRUNCATE TABLE' },
  { pattern: /\bDELETE\s+FROM\s+\S+\s*;?\s*$/im, desc: 'SQL DELETE without WHERE clause' },
  { pattern: /\bgit\s+push\s+[^|;]*(-f|--force(?!-with-lease))/, desc: 'git push --force (use --force-with-lease instead)' },
  { pattern: /\bgit\s+reset\s+--hard\b/, desc: 'git reset --hard' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/, desc: 'git clean -f (force clean untracked files)' },
  { pattern: /\bgit\s+branch\s+-D\b/, desc: 'git branch -D (force delete branch)' },
  { pattern: /\bchmod\s+777\b/, desc: 'chmod 777 (world-writable)' },
  { pattern: />\s*\/dev\/sd[a-z]/, desc: 'write to raw disk device' },
  { pattern: /:\(\)\{\s*:\|\s*:&\s*\}\s*;/, desc: 'fork bomb' },
  { pattern: /\bmkfs\b/, desc: 'mkfs (format filesystem)' },
  { pattern: /\bdd\s+.*of=\/dev\//, desc: 'dd to raw device' },
];

function isEnabled() {
  try {
    const content = fs.readFileSync(STATE_FILE, 'utf8').trim();
    return content !== 'off';
  } catch {
    // File doesn't exist = enabled by default
    return true;
  }
}

function main() {
  if (!isEnabled()) {
    // Careful mode disabled — pass through
    return;
  }

  // Read tool input from stdin
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    return;
  }

  let toolInput;
  try {
    toolInput = JSON.parse(input);
  } catch {
    return;
  }

  const command = toolInput.tool_input?.command || '';
  if (!command) return;

  for (const { pattern, desc } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      const result = {
        decision: 'block',
        reason: `[careful-guard] Blocked: ${desc}\nCommand: ${command}\nUse /careful off to temporarily disable this check.`
      };
      process.stdout.write(JSON.stringify(result));
      return;
    }
  }

  // Command is safe — no output means allow
}

main();
