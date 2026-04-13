#!/usr/bin/env node
/**
 * PreCompact Hook (Always-on)
 *
 * Runs before Claude compacts context. Two jobs:
 * 1. Log compaction event (original behavior)
 * 2. Extract lessons/decisions from transcript and write to .memory/today.md
 *    — prevents lesson loss in long sessions that compact many times before Stop
 *    — seen-lessons.json dedup ensures Stop hook won't re-extract the same lessons
 *
 * Non-blocking: errors never block compaction.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  getSessionsDir,
  getDateTimeString,
  getTimeString,
  findFiles,
  ensureDir,
  isGitRepo,
  log,
  getProjectRoot,
  getGlobalMemoryDir,
  appendFile,
} = require('../lib/utils');
const {
  extractFromTranscript,
  lessonKey,
  loadSeenLessonKeys,
  saveSeenLessonKeys,
} = require('../lib/extract-lessons');

const PROJECT_ROOT = getProjectRoot();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const GLOBAL_MEMORY_DIR = getGlobalMemoryDir();
const SESSION_STATE_DIR = path.join(PROJECT_ROOT, '.claude', '.session-state');
const SESSION_STATE_FILE = path.join(SESSION_STATE_DIR, 'stop-summary.json');

function getTimestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSessionStartTime() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      return state.sessionStartTime || null;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Append entry to a .memory/today.md, creating if needed.
 */
function writeToTodayFile(memDir, today, entry, label) {
  if (!fs.existsSync(memDir)) {
    try { fs.mkdirSync(memDir, { recursive: true }); } catch { return; }
  }

  const todayFile = path.join(memDir, 'today.md');
  try {
    let content = '';
    if (fs.existsSync(todayFile)) {
      content = fs.readFileSync(todayFile, 'utf8');
    }

    if (!content.includes(`# Today — ${today}`)) {
      content = `# Today — ${today}\n\n## Sessions\n\n`;
    }

    // Dedup by marker
    const markerMatch = entry.match(/### \[compact\] (\d{2}:\d{2}) — (.+)/);
    if (markerMatch && content.includes(`[compact] ${markerMatch[1]} — ${markerMatch[2]}`)) {
      log(`[PreCompact] ${label} today.md already has entry for ${markerMatch[1]}, skipping`);
      return;
    }

    content = content.trimEnd() + '\n' + entry;
    fs.writeFileSync(todayFile, content, 'utf8');
  } catch (err) {
    log(`[PreCompact] Failed to write ${label} today.md: ${err.message}`);
  }
}

/**
 * Extract lessons/decisions from transcript and write to memory files.
 */
function extractAndRecordLessons(stdinJson) {
  const timestamp = getTimestamp();
  const today = getLocalDateString();
  const projectName = path.basename(PROJECT_ROOT);

  // Get transcript path
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinJson);
    transcriptPath = input.transcript_path;
  } catch { /* ignore */ }
  if (!transcriptPath) {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  if (!transcriptPath) {
    log('[PreCompact] No transcript_path, skipping lesson extraction');
    return;
  }

  // Load dedup state
  const seenKeys = loadSeenLessonKeys(SESSION_STATE_DIR);

  // Extract from transcript
  const { lessons, decisions } = extractFromTranscript(transcriptPath, seenKeys);

  // Also collect git commits
  let commits = [];
  if (isGitRepo()) {
    try {
      let sinceTime = getSessionStartTime();
      if (!sinceTime) {
        sinceTime = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      }
      const commitLog = execFileSync('git', [
        'log', '--oneline', '--no-merges',
        `--since=${sinceTime}`, '--format=%h %s'
      ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim();

      if (commitLog) {
        commits = commitLog.split('\n').filter(Boolean).slice(0, 20);
      }
    } catch { /* ignore */ }
  }

  const hasCommits = commits.length > 0;
  const hasLessons = lessons.length > 0;
  const hasDecisions = decisions.length > 0;

  // Gate: nothing meaningful → skip
  if (!hasCommits && !hasLessons && !hasDecisions) {
    log('[PreCompact] No lessons/decisions/commits to record');
    return;
  }

  // Build entry — use [compact] marker to distinguish from [auto] (Stop hook)
  const lines = [`\n### [compact] ${timestamp} — ${projectName}`];

  if (hasCommits) {
    lines.push('**Commits:**');
    for (const c of commits.slice(0, 10)) lines.push(`- \`${c}\``);
  }

  if (hasLessons) {
    lines.push('**Lessons:**');
    for (const l of lessons.slice(0, 10)) lines.push(`- ${l}`);
  }

  if (hasDecisions) {
    lines.push('**Decisions:**');
    for (const d of decisions.slice(0, 5)) lines.push(`- ${d}`);
  }

  const entry = lines.join('\n') + '\n';

  // Write to project today.md
  if (fs.existsSync(MEMORY_DIR)) {
    writeToTodayFile(MEMORY_DIR, today, entry, 'project');
  }

  // Write to global today.md (only lessons/decisions)
  if (hasLessons || hasDecisions) {
    const globalLines = [`\n### [compact] ${timestamp} — ${projectName}`];
    if (hasLessons) {
      globalLines.push('**Lessons:**');
      for (const l of lessons.slice(0, 10)) globalLines.push(`- ${l}`);
    }
    if (hasDecisions) {
      globalLines.push('**Decisions:**');
      for (const d of decisions.slice(0, 5)) globalLines.push(`- ${d}`);
    }
    writeToTodayFile(GLOBAL_MEMORY_DIR, today, globalLines.join('\n') + '\n', 'global');
  }

  // Persist seen keys — Stop hook will skip these
  if (hasLessons) {
    saveSeenLessonKeys(SESSION_STATE_DIR, lessons.map(l => lessonKey(l)));
  }

  const parts = [];
  if (hasCommits) parts.push(`${commits.length} commits`);
  if (hasLessons) parts.push(`${lessons.length} lessons`);
  if (hasDecisions) parts.push(`${decisions.length} decisions`);
  log(`[PreCompact] Recorded before compaction: ${parts.join(', ')}`);
}

// ── Main ─────────────────────────────────────────────────────

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  }
});
process.stdin.on('end', () => {
  try {
    // 1. Original: log compaction event
    const sessionsDir = getSessionsDir();
    const compactionLog = path.join(sessionsDir, 'compaction-log.txt');
    ensureDir(sessionsDir);
    appendFile(compactionLog, `[${getDateTimeString()}] Context compaction triggered\n`);

    const sessions = findFiles(sessionsDir, '*-session.tmp');
    if (sessions.length > 0) {
      const activeSession = sessions[0].path;
      appendFile(activeSession, `\n---\n**[Compaction occurred at ${getTimeString()}]** - Context was summarized\n`);
    }

    // 2. New: extract lessons before they get compacted away
    extractAndRecordLessons(stdinData);

    log('[PreCompact] Done');
  } catch (err) {
    log(`[PreCompact] Error: ${err.message}`);
  }
  // Pass through stdin
  process.stdout.write(stdinData);
  process.exit(0);
});
