#!/usr/bin/env node
/**
 * Stop Hook: Session summary → .memory/today.md (Always-on)
 *
 * Extracts meaningful content from the session transcript:
 * - User requests (what was asked)
 * - Files modified (what changed)
 * - Mode escalations (decisions)
 * - Git TODO/FIXME annotations (open loops)
 *
 * Writes to .memory/today.md (cross-tool shared memory).
 * Also checks for console.log in modified files.
 *
 * Throttle: per-session (same session ID only writes once).
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
const LAST_SESSION_FILE = path.join(PROJECT_ROOT, '.claude', '.stop-summary-session');

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

function getLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getSessionId() {
  return process.env.CLAUDE_SESSION_ID || '';
}

/**
 * Daily rotation: if today.md has entries from a previous day,
 * archive them to weekly.md and reset today.md.
 */
function rotateTodayIfNeeded() {
  if (!fs.existsSync(TODAY_FILE)) return;

  try {
    const content = fs.readFileSync(TODAY_FILE, 'utf8');
    if (!content.trim()) return;

    const dateMatch = content.match(/# Today\s*[-—]\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const fileDate = dateMatch[1];
    const today = getLocalDateString();

    if (fileDate === today) return;

    log(`[StopSummary] Rotating today.md (${fileDate}) → weekly.md`);
    const archiveHeader = `\n## ${fileDate}\n\n`;
    const bodyContent = content.replace(/^# Today\s*[-—]\s*\d{4}-\d{2}-\d{2}\n*/, '').trim();

    if (bodyContent) {
      if (!fs.existsSync(WEEKLY_FILE)) {
        fs.writeFileSync(WEEKLY_FILE, `# Weekly Summary\n${archiveHeader}${bodyContent}\n`, 'utf8');
      } else {
        fs.appendFileSync(WEEKLY_FILE, `${archiveHeader}${bodyContent}\n`, 'utf8');
      }
    }

    fs.writeFileSync(TODAY_FILE, `# Today — ${today}\n\n## Sessions\n\n`, 'utf8');
    log(`[StopSummary] Reset today.md for ${today}`);
  } catch (err) {
    log(`[StopSummary] Rotation error (non-blocking): ${err.message}`);
  }
}

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

// ── Transcript parsing ──────────────────────────────────────────────

/**
 * Parse the session transcript (JSONL) and extract:
 * - userTasks: what the user asked (first line of each message, deduped)
 * - filesModified: files written/edited
 * - toolsUsed: unique tool names
 */
function parseTranscript(transcriptPath) {
  const result = { userTasks: [], filesModified: new Set(), toolsUsed: new Set() };

  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return result;

    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // User messages → task descriptions
        if (entry.type === 'user' || entry.role === 'user' || entry.message?.role === 'user') {
          const rawContent = entry.message?.content ?? entry.content;
          const text = typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent.map(c => (c && c.text) || '').join(' ')
              : '';
          const trimmed = text.trim();
          if (trimmed) {
            // Take first meaningful line, max 120 chars
            const firstLine = trimmed.split('\n')[0].slice(0, 120);
            // Skip very short or system-like messages
            if (firstLine.length > 2 && !firstLine.startsWith('<system')) {
              result.userTasks.push(firstLine);
            }
          }
        }

        // Tool uses from assistant content blocks
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              const toolName = block.name || '';
              if (toolName) result.toolsUsed.add(toolName);

              const filePath = block.input?.file_path || '';
              if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
                // Store relative path, strip project root
                const rel = filePath.startsWith(PROJECT_ROOT)
                  ? filePath.slice(PROJECT_ROOT.length + 1)
                  : filePath;
                result.filesModified.add(rel);
              }
            }
          }
        }

        // Direct tool_use entries
        if (entry.type === 'tool_use' || entry.tool_name) {
          const toolName = entry.tool_name || entry.name || '';
          if (toolName) result.toolsUsed.add(toolName);

          const filePath = entry.tool_input?.file_path || entry.input?.file_path || '';
          if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
            const rel = filePath.startsWith(PROJECT_ROOT)
              ? filePath.slice(PROJECT_ROOT.length + 1)
              : filePath;
            result.filesModified.add(rel);
          }
        }
      } catch { /* skip unparseable line */ }
    }
  } catch (err) {
    log(`[StopSummary] Transcript parse error: ${err.message}`);
  }

  return result;
}

/**
 * Extract mode escalations from mode-trace.jsonl (last hour).
 */
function extractModeEscalations() {
  const escalations = [];
  try {
    const { MODE_TRACE_PATH } = require('../lib/mode-check');
    if (!fs.existsSync(MODE_TRACE_PATH)) return escalations;

    const lines = fs.readFileSync(MODE_TRACE_PATH, 'utf8').trim().split('\n');
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (new Date(entry.timestamp).getTime() < cutoff) continue;
        if (entry.prev_mode === entry.next_mode) continue;
        if (entry.trigger === 'task-router' && entry.next_mode === 'fast') continue;
        escalations.push(
          entry.overridden_by_user
            ? `模式覆盖: ${entry.prev_mode} → ${entry.next_mode}`
            : `自动升档: ${entry.prev_mode} → ${entry.next_mode} (${entry.reason})`
        );
      } catch { /* skip */ }
    }
  } catch { /* mode-check not available */ }
  return escalations;
}

/**
 * Extract new TODO/FIXME from git diff.
 */
function extractGitAnnotations() {
  const annotations = [];
  if (!isGitRepo()) return annotations;

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
          annotations.push(`${path.basename(currentFile)}: ${tag}: ${msg}`);
        }
      }
    }
  } catch { /* git diff failed */ }
  return annotations;
}

// ── Main write logic ────────────────────────────────────────────────

/**
 * Build and write session summary to .memory/today.md.
 *
 * Throttle: per-session ID (same session writes at most once).
 * If no session ID available, falls back to 5-min time throttle.
 */
function writeSessionMemory(mode, stdinContent) {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    rotateTodayIfNeeded();

    // ── Per-session throttle ──
    const sessionId = getSessionId();
    if (sessionId) {
      try {
        if (fs.existsSync(LAST_SESSION_FILE)) {
          const lastId = fs.readFileSync(LAST_SESSION_FILE, 'utf8').trim();
          if (lastId === sessionId) {
            log('[StopSummary] Same session already recorded, skipping');
            return;
          }
        }
      } catch { /* proceed */ }
    }

    // ── Get transcript path from stdin ──
    let transcriptPath = null;
    try {
      const input = JSON.parse(stdinContent);
      transcriptPath = input.transcript_path;
    } catch {
      transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
    }

    // ── Gather all content sources ──
    const transcript = parseTranscript(transcriptPath);
    const escalations = extractModeEscalations();
    const annotations = extractGitAnnotations();

    // ── Decide if worth writing ──
    // Only write metadata (files, escalations, annotations).
    // Session CONTENT summaries are written by Claude in-conversation,
    // not by this hook. This prevents noisy user-message dumps.
    const hasFiles = transcript.filesModified.size > 0;
    const hasEscalations = escalations.length > 0;
    const hasAnnotations = annotations.length > 0;

    if (!hasFiles && !hasEscalations && !hasAnnotations) {
      log('[StopSummary] No metadata to record, skipping (content written by Claude)');
      return;
    }

    // ── Ensure today.md exists ──
    if (!fs.existsSync(TODAY_FILE)) {
      fs.writeFileSync(TODAY_FILE, `# Today — ${getLocalDateString()}\n\n## Sessions\n\n`, 'utf8');
    }

    // ── Build minimal metadata entry ──
    const timestamp = getTimestamp();
    const parts = [];

    // Files modified (max 10) — append to existing session entry if Claude already wrote one
    if (hasFiles) {
      const files = Array.from(transcript.filesModified)
        .filter(f => !f.startsWith('.memory/'))  // Skip memory files themselves
        .slice(0, 10);
      if (files.length > 0) {
        parts.push(`**Files:** ${files.join(', ')}`);
      }
    }

    // Mode escalations
    if (hasEscalations) {
      escalations.forEach(e => parts.push(`- ${e}`));
    }

    // Git annotations
    if (hasAnnotations) {
      parts.push('**Open loops:**');
      annotations.forEach(a => parts.push(`- ${a}`));
    }

    if (parts.length === 0) {
      log('[StopSummary] No meaningful metadata after filtering, skipping');
      return;
    }

    const entry = `### [Claude Code] ${timestamp}\n` + parts.join('\n') + '\n\n';
    fs.appendFileSync(TODAY_FILE, entry, 'utf8');

    // Update session throttle
    if (sessionId) {
      try { fs.writeFileSync(LAST_SESSION_FILE, sessionId, 'utf8'); } catch {}
    }

    log(`[StopSummary] Recorded: ${transcript.userTasks.length} tasks, ${transcript.filesModified.size} files, ${escalations.length} escalations`);
  } catch (err) {
    log(`[StopSummary] Memory write failed (non-blocking): ${err.message}`);
  }
}

function main() {
  const mode = getCurrentMode();

  checkConsoleLogs();

  // Fast/Standard: write session memory
  // Heavy: skip — the full Stop chain handles memory
  if (mode !== 'heavy') {
    writeSessionMemory(mode, stdinData);
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
