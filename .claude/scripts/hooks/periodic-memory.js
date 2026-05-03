#!/usr/bin/env node
/**
 * Periodic Memory Extraction (Always-on)
 *
 * PostToolUse hook — runs on every tool completion but immediately exits
 * unless 30+ minutes have passed since last extraction. When triggered,
 * extracts lessons/decisions from transcript and writes to today.md.
 *
 * Designed for long-running sessions (Telegram/Discord channels) that
 * may never hit Stop or PreCompact.
 *
 * Non-blocking: errors never affect tool execution.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Config ──
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STATE_DIR = path.join(
  process.env.HOME || '/home/ubuntu',
  '.claude', '.session-state'
);
const LAST_RUN_FILE = path.join(STATE_DIR, 'periodic-memory-last.json');

// ── Fast exit: time gate ──
function shouldRun() {
  try {
    if (fs.existsSync(LAST_RUN_FILE)) {
      const data = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
      if (Date.now() - (data.ts || 0) < INTERVAL_MS) return false;
    }
  } catch { /* run if state is corrupt */ }
  return true;
}

// Read all stdin first (required by hook protocol), then decide
const MAX_STDIN = 512 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  }
});
process.stdin.on('end', () => {
  // Always pass through stdin
  process.stdout.write(stdinData);

  if (!shouldRun()) {
    process.exit(0);
    return;
  }

  try {
    run(stdinData);
  } catch (err) {
    log(`[PeriodicMemory] Error: ${err.message}`);
  }
  process.exit(0);
});

function log(msg) {
  process.stderr.write(msg + '\n');
}

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function run(stdinJson) {
  // Get transcript path from stdin JSON
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinJson);
    transcriptPath = input.transcript_path;
  } catch { /* ignore */ }
  if (!transcriptPath) {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    // Update last-run so we don't re-check every tool call
    saveLastRun(0, 0, 'no transcript');
    return;
  }

  // Load shared libraries
  let extractLib;
  try {
    extractLib = require('../lib/extract-lessons');
  } catch (err) {
    log(`[PeriodicMemory] Cannot load extract-lessons: ${err.message}`);
    saveLastRun(0, 0, 'lib error');
    return;
  }

  let utils;
  try {
    utils = require('../lib/utils');
  } catch (err) {
    log(`[PeriodicMemory] Cannot load utils: ${err.message}`);
    saveLastRun(0, 0, 'lib error');
    return;
  }

  const projectRoot = utils.getProjectRoot();
  const projectName = path.basename(projectRoot);
  const memDir = path.join(projectRoot, '.memory');
  const globalMemDir = utils.getGlobalMemoryDir();
  const sessionStateDir = path.join(projectRoot, '.claude', '.session-state');

  // Load dedup state
  const seenKeys = extractLib.loadSeenLessonKeys(sessionStateDir);

  // Extract lessons/decisions from transcript
  const { lessons, decisions } = extractLib.extractFromTranscript(transcriptPath, seenKeys);

  // Collect git commits since session start
  let commits = [];
  if (utils.isGitRepo()) {
    try {
      const stateFile = path.join(sessionStateDir, 'stop-summary.json');
      let sinceTime = null;
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        sinceTime = state.sessionStartTime;
      }
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

  if (!hasCommits && !hasLessons && !hasDecisions) {
    saveLastRun(0, 0, 'nothing to record');
    return;
  }

  const timestamp = getTimestamp();
  const today = getLocalDateString();

  // Build entry — use [periodic] marker
  const lines = [`\n### [periodic] ${timestamp} — ${projectName}`];
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
  if (fs.existsSync(memDir)) {
    writeToTodayFile(memDir, today, entry, 'project');
  }

  // Write to global today.md (only lessons/decisions)
  if (hasLessons || hasDecisions) {
    const globalLines = [`\n### [periodic] ${timestamp} — ${projectName}`];
    if (hasLessons) {
      globalLines.push('**Lessons:**');
      for (const l of lessons.slice(0, 10)) globalLines.push(`- ${l}`);
    }
    if (hasDecisions) {
      globalLines.push('**Decisions:**');
      for (const d of decisions.slice(0, 5)) globalLines.push(`- ${d}`);
    }
    writeToTodayFile(globalMemDir, today, globalLines.join('\n') + '\n', 'global');
  }

  // Persist seen keys
  if (hasLessons) {
    extractLib.saveSeenLessonKeys(sessionStateDir, lessons.map(l => extractLib.lessonKey(l)));
  }

  const parts = [];
  if (hasCommits) parts.push(`${commits.length} commits`);
  if (hasLessons) parts.push(`${lessons.length} lessons`);
  if (hasDecisions) parts.push(`${decisions.length} decisions`);

  saveLastRun(lessons.length, decisions.length, 'ok');
  log(`[PeriodicMemory] Extracted: ${parts.join(', ')}`);
}

function writeToTodayFile(memDir, today, entry, label) {
  try {
    if (!fs.existsSync(memDir)) {
      fs.mkdirSync(memDir, { recursive: true });
    }
    const todayFile = path.join(memDir, 'today.md');
    let content = '';
    if (fs.existsSync(todayFile)) {
      content = fs.readFileSync(todayFile, 'utf8');
    }
    if (!content.includes(`# Today — ${today}`)) {
      content = `# Today — ${today}\n\n## Sessions\n\n`;
    }
    // Dedup by marker
    const markerMatch = entry.match(/### \[periodic\] (\d{2}:\d{2}) — (.+)/);
    if (markerMatch && content.includes(`[periodic] ${markerMatch[1]} — ${markerMatch[2]}`)) {
      return;
    }
    content = content.trimEnd() + '\n' + entry;
    fs.writeFileSync(todayFile, content, 'utf8');
  } catch (err) {
    log(`[PeriodicMemory] Failed to write ${label} today.md: ${err.message}`);
  }
}

function saveLastRun(lessons, decisions, status) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({
      ts: Date.now(),
      lessons, decisions, status,
    }), 'utf8');
  } catch { /* ignore */ }
}
