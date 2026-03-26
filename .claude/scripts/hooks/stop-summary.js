#!/usr/bin/env node
/**
 * Stop Hook: Lightweight session summary (Always-on)
 *
 * Records only high-value information at session end:
 * - Decisions made (and reasons)
 * - Constraints discovered
 * - Open loops (unfinished work)
 *
 * Replaces the 9-hook Stop chain for Fast/Standard modes.
 * Heavy mode still runs the full Stop chain.
 *
 * Writes to .memory/today.md (cross-tool shared memory).
 * Also checks for console.log in modified files (merged from check-console-log.js).
 *
 * Cross-platform (Windows, macOS, Linux)
 * Non-blocking: errors are logged but never block exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log, getProjectRoot } = require('../lib/utils');

const PROJECT_ROOT = getProjectRoot();
const MODE_FILE = path.join(PROJECT_ROOT, '.claude', '.task-mode');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');
const WRITE_LOCK_FILE = path.join(PROJECT_ROOT, '.claude', '.stop-summary-last');
const MIN_WRITE_INTERVAL_MS = 5 * 60 * 1000; // At most once per 5 minutes

// Exclusions for console.log check
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

function getCurrentMode() {
  try {
    return fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
  } catch {
    return 'fast';
  }
}

function getTimestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Local date string (YYYY-MM-DD) — fixes P3 timezone issue */
function getLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Daily rotation: if today.md has entries from a previous day,
 * archive them to weekly.md and reset today.md.
 * Fixes P2: rotation was only in Heavy-mode shared-memory-sync.
 */
function rotateTodayIfNeeded() {
  if (!fs.existsSync(TODAY_FILE)) return;

  try {
    const content = fs.readFileSync(TODAY_FILE, 'utf8');
    if (!content.trim()) return;

    // Extract date from first heading like "# Today — 2026-03-25"
    const dateMatch = content.match(/# Today\s*[-—]\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const fileDate = dateMatch[1];
    const today = getLocalDateString();

    if (fileDate === today) return; // Same day, no rotation

    // Archive to weekly.md
    log(`[StopSummary] Rotating today.md (${fileDate}) → weekly.md`);
    const archiveHeader = `\n## ${fileDate}\n\n`;
    // Strip the "# Today — date" header before archiving
    const bodyContent = content.replace(/^# Today\s*[-—]\s*\d{4}-\d{2}-\d{2}\n*/, '').trim();

    if (bodyContent) {
      if (!fs.existsSync(WEEKLY_FILE)) {
        fs.writeFileSync(WEEKLY_FILE, `# Weekly Summary\n${archiveHeader}${bodyContent}\n`, 'utf8');
      } else {
        fs.appendFileSync(WEEKLY_FILE, `${archiveHeader}${bodyContent}\n`, 'utf8');
      }
    }

    // Reset today.md for new day
    fs.writeFileSync(TODAY_FILE, `# Today — ${today}\n\n## Sessions\n\n`, 'utf8');
    log(`[StopSummary] Reset today.md for ${today}`);
  } catch (err) {
    log(`[StopSummary] Rotation error (non-blocking): ${err.message}`);
  }
}

/**
 * Check for console.log in modified files (merged from check-console-log.js).
 */
function checkConsoleLogs() {
  if (!isGitRepo()) return;

  try {
    const files = getGitModifiedFiles(['\\.tsx?$', '\\.jsx?$'])
      .filter(f => fs.existsSync(f))
      .filter(f => !EXCLUDED_PATTERNS.some(pattern => pattern.test(f)));

    let hasConsole = false;
    for (const file of files) {
      const content = readFile(file);
      if (content && content.includes('console.log')) {
        log(`[StopSummary] console.log found in ${file}`);
        hasConsole = true;
      }
    }
    if (hasConsole) {
      log('[StopSummary] Remove console.log before committing');
    }
  } catch (err) {
    log(`[StopSummary] console.log check error: ${err.message}`);
  }
}

/**
 * Extract high-value signals from the current session.
 * Returns { decisions, constraints, openLoops } arrays.
 *
 * Conservative: only extracts what's clearly identifiable, skips if unsure.
 * Deliberately does NOT record:
 * - "N file(s) modified" — git status can show this anytime
 * - "Task ran in X mode" — mode itself is not a decision/constraint
 */
function extractHighValueContent(stdinContent) {
  const result = { decisions: [], constraints: [], openLoops: [] };

  try {
    // Check mode-trace for mode escalations (= decisions worth recording)
    try {
      const { MODE_TRACE_PATH } = require('../lib/mode-check');
      if (fs.existsSync(MODE_TRACE_PATH)) {
        const lines = fs.readFileSync(MODE_TRACE_PATH, 'utf8').trim().split('\n');
        const cutoff = Date.now() - 60 * 60 * 1000; // last hour
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (new Date(entry.timestamp).getTime() < cutoff) continue;
            if (entry.prev_mode === entry.next_mode) continue;
            if (entry.trigger === 'task-router' && entry.next_mode === 'fast') continue; // session init, not interesting
            const desc = entry.overridden_by_user
              ? `用户覆盖模式: ${entry.prev_mode} → ${entry.next_mode}`
              : `自动升档: ${entry.prev_mode} → ${entry.next_mode} (${entry.reason})`;
            result.decisions.push(desc);
          } catch { /* skip malformed line */ }
        }
      }
    } catch { /* mode-check not available */ }

    // Check for NEW TODO/FIXME/HACK in git diff (only newly added lines)
    if (isGitRepo()) {
      try {
        const { execFileSync } = require('child_process');
        const diff = execFileSync('git', ['diff', '--cached', '--diff-filter=AM', '-U0'], {
          encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000
        });
        // Also check unstaged
        const diffUnstaged = execFileSync('git', ['diff', '-U0'], {
          encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000
        });
        const allDiff = diff + diffUnstaged;
        let currentFile = '';
        for (const line of allDiff.split('\n')) {
          if (line.startsWith('diff --git')) {
            const match = line.match(/b\/(.+)$/);
            currentFile = match ? match[1] : '';
          }
          // Only look at added lines in user code (skip hooks/scripts/tests/config)
          if (line.startsWith('+') && !line.startsWith('+++')) {
            // Skip hook/script/config files — their comments are not user TODOs
            if (/\.(config|spec|test)\.[jt]sx?$/.test(currentFile)) continue;
            if (/scripts\/|hooks\/|__tests__\/|__mocks__\//.test(currentFile)) continue;
            // Must be a real annotation, not just the word in a comment about annotations
            const todoMatch = line.match(/^\+\s*(?:\/\/|\/?\*|#)?\s*\b(TODO|FIXME|HACK|XXX)[\s:]+(.{3,})/i);
            if (todoMatch) {
              const tag = todoMatch[1].toUpperCase();
              const msg = todoMatch[2].trim().slice(0, 100);
              // Skip lines that are merely describing/documenting these tags
              if (/\b(known|tech debt|constraint|open loop)\b/i.test(msg)) continue;
              const basename = path.basename(currentFile);
              if (tag === 'TODO') {
                result.openLoops.push(`${basename}: ${tag}: ${msg}`);
              } else {
                result.constraints.push(`${basename}: ${tag}: ${msg}`);
              }
            }
          }
        }
      } catch {
        // git diff failed — skip
      }
    }
  } catch {
    // Can't parse stdin — that's fine, just means less context
  }

  return result;
}

/**
 * Write high-value memory to .memory/today.md.
 * Only writes if there's actual content worth recording.
 * If no decisions/constraints/open loops found, skips entirely — no noise.
 *
 * Only writes in Fast/Standard mode.
 * Heavy mode defers to the full Stop chain (sprint-memory, shared-memory-sync, etc.)
 */
function writeMinimalMemory(mode, stdinContent) {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    // Rotate first
    rotateTodayIfNeeded();

    // Throttle: skip if we wrote recently (Stop fires on every response)
    try {
      if (fs.existsSync(WRITE_LOCK_FILE)) {
        const lastWrite = fs.statSync(WRITE_LOCK_FILE).mtimeMs;
        if (Date.now() - lastWrite < MIN_WRITE_INTERVAL_MS) {
          log('[StopSummary] Throttled (wrote <5min ago), skipping');
          return;
        }
      }
    } catch { /* lock file check failed — proceed */ }

    // Extract high-value content
    const { decisions, constraints, openLoops } = extractHighValueContent(stdinContent);

    // If nothing worth recording, skip entirely — no noise
    const hasContent = decisions.length > 0 || constraints.length > 0 || openLoops.length > 0;
    if (!hasContent) {
      log('[StopSummary] No high-value content to record, skipping write');
      return;
    }

    // Ensure today.md exists with header
    if (!fs.existsSync(TODAY_FILE)) {
      fs.writeFileSync(TODAY_FILE, `# Today — ${getLocalDateString()}\n\n## Sessions\n\n`, 'utf8');
    }

    // Build entry with only non-empty sections
    const timestamp = getTimestamp();
    const parts = [`### [Claude Code] ${timestamp}`];

    if (decisions.length > 0) {
      parts.push('**Decisions:**');
      decisions.forEach(d => parts.push(`- ${d}`));
    }
    if (constraints.length > 0) {
      parts.push('**Constraints:**');
      constraints.forEach(c => parts.push(`- ${c}`));
    }
    if (openLoops.length > 0) {
      parts.push('**Open loops:**');
      openLoops.forEach(o => parts.push(`- ${o}`));
    }

    const entry = parts.join('\n') + '\n\n';
    fs.appendFileSync(TODAY_FILE, entry, 'utf8');
    // Update throttle lock
    try { fs.writeFileSync(WRITE_LOCK_FILE, String(Date.now()), 'utf8'); } catch {}
    log(`[StopSummary] Appended ${decisions.length}d/${constraints.length}c/${openLoops.length}o to ${TODAY_FILE}`);
  } catch (err) {
    log(`[StopSummary] Memory write failed (non-blocking): ${err.message}`);
  }
}

function main() {
  const mode = getCurrentMode();

  // Always: check console.log
  checkConsoleLogs();

  // Fast/Standard: write high-value memory only (with rotation)
  // Heavy: skip — the full Stop chain handles memory
  if (mode !== 'heavy') {
    writeMinimalMemory(mode, stdinData);
  }

  log(`[StopSummary] Done (mode: ${mode})`);
}

// ── stdin entry point ────────────────────────────────────────
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
  try {
    main();
  } catch (err) {
    log(`[StopSummary] Error: ${err.message}`);
  }
  // Always pass through stdin → stdout
  process.stdout.write(stdinData);
  process.exit(0);
});
