#!/usr/bin/env node
/**
 * Careful Guard — Destructive Command Interceptor (v2, 2026-05-09)
 *
 * PreToolUse hook for Bash. Decides allow/block by classifying the command
 * against three pattern groups and (for context-aware patterns) checking
 * actual consequences before deciding.
 *
 * Design (v2, root-cause rewrite of v1):
 * ─────────────────────────────────────────────────────────────────────
 * v1 used flat pattern matching: any match → block. This produced false
 * positives on legitimate operations whose risk is contextual (e.g.
 * `git reset --hard origin/main` on a clean tree is a routine prod-deploy
 * sync; on a dirty tree it loses work). The rewrite distinguishes
 * "pattern matched" from "actual risk", and gates on the second.
 *
 * Three groups:
 *   • DENY — unconditional block. fork bomb, mkfs, dd to /dev/sd*,
 *            rm -rf /, rm -rf $HOME. No legitimate use under any cwd/mode.
 *   • CONTEXTUAL — pattern is necessary but not sufficient signal of risk.
 *            Run a context check (e.g. "is git working tree clean?") to
 *            decide block vs allow.
 *   • ALLOWLIST_PREFIX — well-known safe entry points (./scripts/pull-all.sh,
 *            ./restart.sh, git pull, …). When a command is a single simple
 *            invocation (no chain operators) starting with one of these,
 *            it is allowed without further pattern checks.
 *
 * Exposed API (for unit tests):
 *   classifyCommand(command, ctx) → { decision, reason }
 *     decision = 'allow' | 'block'
 *     ctx.cwd: working directory (for git status checks)
 *
 * Toggle: /careful off to disable, /careful on to re-enable.
 * State file: ~/.claude/.careful-enabled (absent = enabled by default).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const STATE_FILE = path.join(os.homedir(), '.claude', '.careful-enabled');

// ─── Group 1: DENY (unconditional, no context can save them) ────────
const DENY_PATTERNS = [
  { pattern: /:\(\)\{\s*:\|\s*:&\s*\}\s*;/, desc: 'fork bomb' },
  { pattern: /\bmkfs\b/, desc: 'mkfs (format filesystem)' },
  { pattern: /\bdd\s+.*of=\/dev\//, desc: 'dd to raw device' },
  { pattern: />\s*\/dev\/sd[a-z]/, desc: 'write to raw disk device' },
  // rm -rf / OR rm -rf $HOME / rm -rf ~ — but allow rm -rf /tmp/*
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(?!tmp\b|var\/tmp\b)\s*$/, desc: 'rm -rf / (root)' },
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\$HOME|~)(\/?\s*$|\s+)/, desc: 'rm -rf $HOME' },
  { pattern: /\bchmod\s+(-R\s+)?777\s+\/\s*$/, desc: 'chmod 777 /' },
];

// ─── Group 2: CONTEXTUAL (pattern + context check) ──────────────────
// Each entry has a `check(command, ctx)` returning:
//   { allow: true }   — pattern matched but context proves it's safe
//   { allow: false, reason: '...' } — pattern matched and risk confirmed
const CONTEXTUAL_PATTERNS = [
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    desc: 'git reset --hard',
    check: (command, ctx) => {
      // Only allow `git reset --hard origin/<branch>` form (explicit remote
      // sync target, not HEAD~N or sha which can lose committed work
      // recoverable only via reflog).
      const safeTarget = /^\s*git\s+reset\s+--hard\s+origin\/[\w./-]+\s*$/;
      if (!safeTarget.test(command.trim())) {
        return {
          allow: false,
          reason: 'target is not `origin/<branch>` form — ambiguous reset can ' +
                  'lose committed work that only reflog can recover',
        };
      }
      // Working tree must be clean — the only real consequence of
      // `reset --hard origin/main` is losing uncommitted work.
      if (!isGitTreeClean(ctx.cwd)) {
        return {
          allow: false,
          reason: 'working tree has uncommitted changes; `git stash` first ' +
                  'or use `/careful off` if intentional discard',
        };
      }
      return { allow: true };
    },
  },
  {
    pattern: /\bgit\s+push\s+[^|;]*(-f\b|--force(?!-with-lease))/,
    desc: 'git push --force (use --force-with-lease)',
    check: () => ({ allow: false, reason: 'use `--force-with-lease` to avoid clobbering remote' }),
  },
  {
    pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/,
    desc: 'git clean -f (force clean untracked files)',
    check: () => ({ allow: false, reason: 'untracked files would be lost' }),
  },
  {
    pattern: /\bgit\s+branch\s+-D\b/,
    desc: 'git branch -D (force delete branch)',
    check: () => ({ allow: false, reason: 'unmerged commits on the branch would only be reachable via reflog' }),
  },
  {
    pattern: /\bgit\s+checkout\s+--\s+\./,
    desc: 'git checkout -- . (discard all unstaged changes)',
    check: (command, ctx) => {
      if (isGitTreeClean(ctx.cwd)) return { allow: true }; // no-op on clean tree
      return { allow: false, reason: 'unstaged changes in working tree would be discarded' };
    },
  },
  {
    pattern: /\bgit\s+restore\s+\./,
    desc: 'git restore . (discard all unstaged changes)',
    check: (command, ctx) => {
      if (isGitTreeClean(ctx.cwd)) return { allow: true };
      return { allow: false, reason: 'unstaged changes in working tree would be discarded' };
    },
  },
  {
    pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
    desc: 'SQL DROP statement',
    check: () => ({ allow: false, reason: 'irreversible data loss' }),
  },
  {
    pattern: /\bTRUNCATE\s+TABLE\b/i,
    desc: 'SQL TRUNCATE TABLE',
    check: () => ({ allow: false, reason: 'irreversible data loss' }),
  },
  {
    pattern: /\bDELETE\s+FROM\s+\S+(?![\s\S]*\bWHERE\b)/im,
    desc: 'SQL DELETE without WHERE clause',
    check: () => ({ allow: false, reason: 'unbounded DELETE wipes the entire table' }),
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/,
    desc: 'rm -rf (recursive force delete)',
    check: (command) => {
      // Allow rm -rf on tmp / build artifact paths
      const safeTargets = /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/tmp\/|\/var\/tmp\/|\.\/target\/|target\/|\.\/node_modules\/|node_modules\/|\.\/build\/|build\/|\.\/dist\/|dist\/)/;
      if (safeTargets.test(command)) return { allow: true };
      return { allow: false, reason: 'verify target path is correct; if intentional use `/careful off`' };
    },
  },
  {
    pattern: /\bchmod\s+777\b/,
    desc: 'chmod 777 (world-writable)',
    check: () => ({ allow: false, reason: 'security risk; use specific octal like 755 or 644' }),
  },
];

// ─── Group 3: ALLOWLIST_PREFIX (single-invocation safe entry points) ─
// Only applies when the command is a SINGLE simple invocation
// (no &&, ||, ;, |, $(...), backticks). Otherwise full pattern check runs.
const ALLOWLIST_PREFIXES = [
  // Read-only / sync git operations
  /^git\s+pull(\s|$)/,
  /^git\s+pull\s+--rebase(\s|$)/,
  /^git\s+fetch(\s|$)/,
  /^git\s+status(\s|$)/,
  /^git\s+log(\s|$)/,
  /^git\s+diff(\s|$)/,
  /^git\s+show(\s|$)/,
  /^git\s+blame(\s|$)/,
  /^git\s+rev-parse(\s|$)/,
  // Project ops scripts (they encapsulate destructive ops behind tested logic)
  /^\.\/scripts\/(pull|push|deploy|audit|health|check|post-restart|memory|stress)-/,
  /^\.\/scripts\/[a-z][a-z0-9_-]*\.sh(\s|$)/,
  /^\.\/restart\.sh(\s|$)/,
  /^\.\/start\.sh(\s|$)/,
  /^\.\/stop\.sh(\s|$)/,
  /^\.\/deploy\.sh(\s|$)/,
  /^\.\/tools\/install-git-hooks\.sh(\s|$)/,
  // cargo (dev mode required)
  /^cargo\s+(build|check|test|fmt|clippy|run|bench|doc)(\s|$)/,
  // npm/pnpm/yarn (frontend)
  /^npm\s+(install|ci|run|test|start|build)(\s|$)/,
  /^pnpm\s+(install|run|test|build)(\s|$)/,
];

// ─── Helpers ────────────────────────────────────────────────────────

function isEnabled() {
  try {
    const content = fs.readFileSync(STATE_FILE, 'utf8').trim();
    return content !== 'off';
  } catch {
    return true; // file absent = enabled
  }
}

/**
 * Strip quoted strings to avoid false positives from commit messages /
 * echo statements / string literals. Only the command structure matters.
 */
function stripQuotes(command) {
  return command
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/\$\(cat\s*<<[^)]*\)/gs, '');
}

/**
 * True iff the command is a single simple invocation — no chaining,
 * no command substitution. Pattern check still runs for chained commands
 * because each segment may individually be dangerous.
 */
function isSimpleInvocation(commandStripped) {
  // After stripping quotes, any of these chars indicate composition.
  return !/[&|;`$()]/.test(commandStripped);
}

function isAllowlisted(command) {
  const stripped = stripQuotes(command);
  if (!isSimpleInvocation(stripped)) return false;
  const trimmed = command.trim();
  return ALLOWLIST_PREFIXES.some((rx) => rx.test(trimmed));
}

function isGitTreeClean(cwd) {
  try {
    const out = execSync('git status --porcelain', {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === '';
  } catch {
    return false; // not a git repo / git error → conservative
  }
}

/**
 * Pure classifier — no I/O except optional git status (when ctx.cwd given).
 * Returns { decision, reason } where decision is 'allow' or 'block'.
 *
 * @param {string} command - raw command from tool_input.command
 * @param {object} ctx - { cwd?: string }
 */
function classifyCommand(command, ctx = {}) {
  if (!command) return { decision: 'allow', reason: 'empty command' };

  // Allowlist takes priority — well-known safe entry points pass through.
  if (isAllowlisted(command)) {
    return { decision: 'allow', reason: 'allowlist prefix match' };
  }

  const stripped = stripQuotes(command);

  // Group 1: DENY — unconditional.
  for (const { pattern, desc } of DENY_PATTERNS) {
    if (pattern.test(stripped)) {
      return {
        decision: 'block',
        reason: `${desc} (no legitimate context allows this)`,
      };
    }
  }

  // Group 2: CONTEXTUAL — pattern + context check.
  for (const { pattern, desc, check } of CONTEXTUAL_PATTERNS) {
    if (pattern.test(stripped)) {
      const result = check(command, ctx);
      if (result.allow) {
        return { decision: 'allow', reason: `${desc}: context check passed` };
      }
      return {
        decision: 'block',
        reason: `${desc}: ${result.reason}`,
      };
    }
  }

  return { decision: 'allow', reason: 'no pattern matched' };
}

// ─── Hook entry point ───────────────────────────────────────────────

function main() {
  if (!isEnabled()) return; // /careful off — pass through

  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => {
    let toolInput;
    try { toolInput = JSON.parse(data); } catch { return; }

    const command = toolInput.tool_input?.command || '';
    const cwd = toolInput.tool_input?.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

    const { decision, reason } = classifyCommand(command, { cwd });
    if (decision === 'block') {
      const result = {
        decision: 'block',
        reason: `[careful-guard] Blocked: ${reason}\nCommand: ${command}\n` +
                `Use \`/careful off\` to temporarily disable this check.`,
      };
      process.stdout.write(JSON.stringify(result));
      return;
    }
    // allow → no output (Claude Code spec: empty stdout = pass through)
  });
}

if (require.main === module) {
  main();
}

// ─── Exports for unit tests ─────────────────────────────────────────
module.exports = {
  classifyCommand,
  isAllowlisted,
  isSimpleInvocation,
  isGitTreeClean,
  stripQuotes,
  DENY_PATTERNS,
  CONTEXTUAL_PATTERNS,
  ALLOWLIST_PREFIXES,
};
