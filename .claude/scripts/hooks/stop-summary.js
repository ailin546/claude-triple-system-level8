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
const MIN_WRITE_INTERVAL_MS = 60 * 1000; // At most once per 1 minute (was 5min, too aggressive)

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
 * Extract session summary from transcript file.
 * Returns { userTasks, filesModified } or null.
 */
function extractFromTranscript(stdinContent) {
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinContent);
    transcriptPath = input.transcript_path;
  } catch {}
  if (!transcriptPath) transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    const content = readFile(transcriptPath);
    if (!content) return null;

    const lines = content.split('\n').filter(Boolean);
    const userTasks = [];
    const filesModified = new Set();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Collect user messages (= task descriptions)
        if (entry.type === 'user' || entry.role === 'user' || entry.message?.role === 'user') {
          const rawContent = entry.message?.content ?? entry.content;
          const text = typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent.map(c => (c && c.text) || '').join(' ')
              : '';
          const trimmed = text.trim();
          // Only keep substantive messages (skip short confirmations like "yes", "ok")
          if (trimmed && trimmed.length > 10) {
            userTasks.push(trimmed.slice(0, 150));
          }
        }

        // Collect modified files from tool_use
        if (entry.type === 'tool_use' || entry.tool_name) {
          const toolName = entry.tool_name || entry.name || '';
          const filePath = entry.tool_input?.file_path || entry.input?.file_path || '';
          if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
            filesModified.add(filePath);
          }
        }

        // Extract from assistant message content blocks
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              const filePath = block.input?.file_path || '';
              if (filePath && (block.name === 'Edit' || block.name === 'Write')) {
                filesModified.add(filePath);
              }
            }
          }
        }
      } catch { /* skip unparseable line */ }
    }

    return {
      userTasks: userTasks.slice(-5), // Last 5 user requests
      filesModified: Array.from(filesModified).slice(0, 15),
    };
  } catch {
    return null;
  }
}

/**
 * Extract high-value signals from the current session.
 * Returns { decisions, constraints, openLoops, tasks, files } arrays.
 *
 * Data sources:
 * 1. Transcript (via stdin json → transcript_path) — user tasks + files modified
 * 2. Mode trace — escalation decisions
 * 3. Git diff — new TODO/FIXME/HACK annotations
 */
function extractHighValueContent(stdinContent) {
  const result = { decisions: [], constraints: [], openLoops: [], tasks: [], files: [] };

  // Source 1: Transcript — user tasks and file changes
  try {
    const transcript = extractFromTranscript(stdinContent);
    if (transcript) {
      result.tasks = transcript.userTasks;
      result.files = transcript.filesModified;
    }
  } catch { /* non-blocking */ }

  // Source 2: Mode trace — escalation decisions (skip noise)
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
          if (entry.trigger === 'task-router' && entry.next_mode === 'fast') continue;
          // Only record user-initiated or significant escalations
          if (entry.overridden_by_user) {
            result.decisions.push(`用户覆盖模式: ${entry.prev_mode} → ${entry.next_mode}`);
          }
          // Skip auto-escalation noise — it's not a real "decision"
        } catch { /* skip malformed line */ }
      }
    }
  } catch { /* mode-check not available */ }

  // Source 3: Git diff — new TODO/FIXME/HACK in user code
  if (isGitRepo()) {
    try {
      const { execFileSync } = require('child_process');
      const diff = execFileSync('git', ['diff', '--cached', '--diff-filter=AM', '-U0'], {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000
      });
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
        if (line.startsWith('+') && !line.startsWith('+++')) {
          if (/\.(config|spec|test)\.[jt]sx?$/.test(currentFile)) continue;
          if (/scripts\/|hooks\/|__tests__\/|__mocks__\//.test(currentFile)) continue;
          const todoMatch = line.match(/^\+\s*(?:\/\/|\/?\*|#)?\s*\b(TODO|FIXME|HACK|XXX)[\s:]+(.{3,})/i);
          if (todoMatch) {
            const tag = todoMatch[1].toUpperCase();
            const msg = todoMatch[2].trim().slice(0, 100);
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
    } catch { /* git diff failed — skip */ }
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
    const { decisions, constraints, openLoops, tasks, files } = extractHighValueContent(stdinContent);

    // If nothing worth recording, skip entirely — no noise
    const hasContent = tasks.length > 0 || decisions.length > 0 || constraints.length > 0 || openLoops.length > 0;
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

    // User tasks — what was worked on this session
    if (tasks.length > 0) {
      parts.push('**Tasks:**');
      tasks.forEach(t => parts.push(`- ${t.replace(/\n/g, ' ')}`));
    }

    // Files modified — what changed
    if (files.length > 0) {
      parts.push(`**Files:** ${files.map(f => path.basename(f)).join(', ')}`);
    }

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
    log(`[StopSummary] Appended ${tasks.length}t/${decisions.length}d/${constraints.length}c/${openLoops.length}o to ${TODAY_FILE}`);
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

  // Push shared memory to remote (if configured)
  try {
    const memorySync = require('../lib/memory-sync');
    if (memorySync.isEnabled()) {
      memorySync.push();
    }
  } catch (err) {
    log(`[StopSummary] Memory sync push skipped: ${err.message}`);
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
