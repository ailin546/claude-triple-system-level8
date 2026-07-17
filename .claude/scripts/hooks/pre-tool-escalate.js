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
 *
 * ── Command matching (2026-06-06 root-cause rewrite) ──────────────────
 * Bash risk patterns are matched against each command SEGMENT independently,
 * with quoted strings stripped (see ../lib/command-scan.js). This fixes a
 * deadlock with evaluation-gate:
 *   • `git push` / `git commit` / `git add` were removed as escalation
 *     signals. Version-control mechanics are NOT risk signals — mode is
 *     driven by WHAT changes (sensitive dirs/keywords/file-count), so a
 *     genuine heavy task is already heavy from its content signals long
 *     before it reaches push. Auto-escalating every push to heavy only
 *     re-tripped evaluation-gate on light tasks.
 *   • set-mode.js segments are skipped — it is the de-escalation CLI, and
 *     scanning its `--reason "..."` text re-escalated the very command that
 *     was lowering the mode (error-log [2026-05-20] follow-up).
 *   • quoted flag values / messages (`-m "...deploy..."`) and cross-command
 *     `.*` spans (`cat secret.txt && echo set`) no longer match.
 *
 * ── Cross-file accumulation (2026-07-16 docs exclusion) ───────────────
 * Prose-documentation files (.md/.txt/.rst/...) are NOT counted toward the
 * 3/6-file thresholds. The counter is a proxy for module-spanning CODE
 * complexity; routing.md explicitly classifies docs work as Fast, so a batch
 * mechanical edit of 18 markdown files must not read as a heavy task. Before
 * this fix, such batches hit the 6-file threshold within seconds and re-hit
 * it after every manual reset (the task legitimately kept touching new .md
 * files), deadlocking docs-only commits against evaluation-gate — same
 * "heuristic lacks immunity for a legitimate work shape" class as the
 * 2026-06-13 hyphenated-path fix. Behavior-bearing config (.json/.yaml/.toml)
 * still counts: excluding it would trade a false positive for a false
 * negative.
 *
 * ── Dir-name signals: prose docs exempt (2026-07-17) ──────────────────
 * The same immunity extends to the Edit/Write dir-name risk signals. A
 * prose doc inside a risk-named directory (docs/auth/setup.md,
 * docs/deploy/guide.md) is documentation ABOUT a sensitive area, not a
 * change TO it — routing.md's "docs work → Fast" applies regardless of
 * where the doc lives. Without the exemption a single Edit under a deploy/
 * or auth/ segment escalated straight to heavy and interlocked with
 * evaluation-gate on docs-only commits. No incident recorded yet, but the
 * shape exists in real repos (cc/paperclip: docs/deploy/ ×9 → heavy,
 * docs/api/ ×11 → standard), and unlike the counter there is no threshold
 * — the first edit fires. Behavior-bearing files in those dirs
 * (.ts/.json/.sh/extensionless) still escalate: isProseDocPath is
 * fail-closed.
 */

'use strict';

const { splitSegments, isSetModeInvocation } = require('../lib/command-scan');

const MAX_STDIN = 1024 * 1024;

// ── Thresholds ───────────────────────────────────────────────

const CROSS_FILE_STANDARD = 3;
const CROSS_FILE_HEAVY = 6;
const TASK_BOUNDARY_MS = (parseInt(process.env.TASK_BOUNDARY_MINUTES, 10) || 5) * 60 * 1000;

// Prose-documentation extensions excluded from cross-file accumulation
// (see header §Cross-file accumulation). Deliberately a narrow prose list,
// not a code whitelist: unknown extensions stay counted (fail-closed), and
// behavior-bearing config (.json/.yaml/.toml) stays counted. `.mdx` also
// stays counted — it compiles to JSX.
const PROSE_DOC_EXTENSIONS = new Set(['md', 'markdown', 'rst', 'adoc', 'asciidoc', 'txt']);

// ── Risk signal definitions ──────────────────────────────────
//
// NOTE: git VCS operations (add/commit/push/checkout/switch/merge/rebase/
// cherry-pick) are intentionally absent. They are version-control mechanics,
// not task-nature signals. routing.md never lists them as escalation
// triggers; matching them here created the evaluation-gate deadlock.

// Bash command patterns → Standard
const STANDARD_BASH_PATTERNS = [
  /\bnpm\s+(run\s+build|run\s+dev|install|ci)\b/,
  /\bpip\s+install\b/,
  /\byarn\s+(add|install)\b/,
  /\bpnpm\s+(add|install)\b/,
  /\bmkdir\b.*\b(api|server|database|migrations|auth|config|infra)\b/,
];

// Bash command patterns → Heavy
//
// Hyphen-aware boundary (2026-06-13): single-word verbs match as STANDALONE
// commands, not as a segment of a hyphenated compound such as the project dir
// name `quant-deploy`. JS `\b` treats `-` as a word boundary, so the old
// /\bdeploy\b/ matched `cd /Users/hi/quant-deploy` and `git -C .../quant-deploy`
// → spurious heavy escalation → evaluation-gate blocked every commit in any
// repo whose path contains a risk keyword (error-log 2026-06-13, same
// substring-matching class as the 2026-06-06 fixes). `(?<![\w-])`/`(?![\w-])`
// reject an adjacent word-char or hyphen while still matching `deploy`,
// `./deploy.sh`, `npm run deploy`, `terraform apply`, `npm run migrate`.
const HEAVY_BASH_PATTERNS = [
  /(?<![\w-])(deploy|terraform|kubectl|helm)(?![\w-])/,
  /\bnpm\s+publish\b/,
  /\bdocker\s+push\b/,
  /(?<![\w-])(migrate|prisma\s+migrate)(?![\w-])/,
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

const MODE_LEVELS = { fast: 0, standard: 1, heavy: 2 };

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

  // Check Bash commands — per-segment, quote-stripped (see command-scan.js).
  if (toolName === 'Bash' || toolName === 'bash') {
    const cmd = toolInput.command || '';
    if (!cmd) return null;

    for (const seg of splitSegments(cmd)) {
      // The de-escalation CLI is never a risk signal; skip it so its
      // --reason text cannot re-escalate the mode it is lowering.
      if (isSetModeInvocation(seg)) continue;

      for (const pattern of HEAVY_BASH_PATTERNS) {
        if (pattern.test(seg)) return { mode: 'heavy', signal: `bash: ${seg.slice(0, 80)}` };
      }
      for (const pattern of STANDARD_BASH_PATTERNS) {
        if (pattern.test(seg)) return { mode: 'standard', signal: `bash: ${seg.slice(0, 80)}` };
      }
    }
    return null;
  }

  // Check Edit/Write file paths
  if (/^(Edit|Write)$/i.test(toolName)) {
    const filePath = (toolInput.file_path || '').replace(/\\/g, '/');
    if (!filePath) return null;

    // Prose docs never escalate on location (see header §Dir-name signals):
    // a guide under docs/deploy/ or docs/auth/ carries no runtime behavior.
    // The SSOT content check below loses nothing — it only applies to
    // .ts/.tsx/.js/.jsx files, which are never prose.
    if (isProseDocPath(filePath)) return null;

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
 * Map a cross-file-accumulation count to an escalation mode (or null).
 * Pure function so the threshold logic is unit-testable.
 *
 * @param {number} fileCount unique files touched this task
 * @returns {'standard'|'heavy'|null}
 */
function accumulationMode(fileCount) {
  if (fileCount >= CROSS_FILE_HEAVY) return 'heavy';
  if (fileCount >= CROSS_FILE_STANDARD) return 'standard';
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

/**
 * True if the path is prose documentation (excluded from the cross-file
 * counter). Extensionless paths return false (unknown → counted).
 */
function isProseDocPath(filePath) {
  const match = /\.([^./\\]+)$/.exec(filePath || '');
  return match ? PROSE_DOC_EXTENSIONS.has(match[1].toLowerCase()) : false;
}

/**
 * Record the tool's target file into escState.filesTracked for cross-file
 * accumulation. Prose docs are skipped — they never count toward the
 * 3/6-file thresholds. Mutates escState; returns the tracked count.
 */
function trackFile(escState, input) {
  const filePath = extractFilePath(input);
  if (filePath && !isProseDocPath(filePath) && !escState.filesTracked.includes(filePath)) {
    escState.filesTracked.push(filePath);
  }
  return escState.filesTracked.length;
}

// ── Main logic ───────────────────────────────────────────────

function runMain() {
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
        getCurrentMode, setMode, MODE_LEVELS: LIB_MODE_LEVELS,
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

      // ── Track unique files (prose docs excluded) ──
      trackFile(escState, input);

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
      const accMode = accumulationMode(fileCount);
      if (accMode && (!targetMode || LIB_MODE_LEVELS[targetMode] < LIB_MODE_LEVELS[accMode])) {
        const threshold = accMode === 'heavy' ? CROSS_FILE_HEAVY : CROSS_FILE_STANDARD;
        targetMode = accMode;
        targetSignal = `${fileCount} unique files (docs excluded)`;
        targetReason = `cross-file: ${fileCount} non-docs files touched (threshold: ${threshold})`;
      }

      // ── Apply escalation (only upgrade, never downgrade) ──
      if (targetMode) {
        const currentLevel = LIB_MODE_LEVELS[currentMode] ?? 0;
        const targetLevel = LIB_MODE_LEVELS[targetMode] ?? 0;

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
}

// ── Exports for unit tests ───────────────────────────────────
module.exports = {
  detectEscalation,
  accumulationMode,
  extractFilePath,
  isProseDocPath,
  trackFile,
  pathContainsDir,
  STANDARD_BASH_PATTERNS,
  HEAVY_BASH_PATTERNS,
  MODE_LEVELS,
  CROSS_FILE_STANDARD,
  CROSS_FILE_HEAVY,
  PROSE_DOC_EXTENSIONS,
};

if (require.main === module) {
  runMain();
}
