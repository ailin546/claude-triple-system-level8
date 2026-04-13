#!/usr/bin/env node
/**
 * Stop Hook (Always-on):
 * 1. Auto-record session facts (git commits + file changes) to today.md
 * 2. Check for console.log in modified files
 * 3. Rotate .memory/today.md → weekly.md on date change
 * 4. Update ~/.memory/index.md (global project index)
 * 5. Push to remote (if configured)
 *
 * Session facts are auto-captured as a safety net.
 * Claude may enrich with semantic summaries in-conversation.
 *
 * Cross-platform. Non-blocking: errors never block exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { isGitRepo, getGitModifiedFiles, readFile, log, getProjectRoot, getGlobalMemoryDir, ensureDir } = require('../lib/utils');
const lessonLib = require('../lib/extract-lessons');

const PROJECT_ROOT = getProjectRoot();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');
const GLOBAL_MEMORY_DIR = getGlobalMemoryDir();
const GLOBAL_INDEX_FILE = path.join(GLOBAL_MEMORY_DIR, 'index.md');

// Exclusions for console.log check
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

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


// Shared helpers — canonical implementations in lib/extract-lessons.js
const cleanLesson = lessonLib.cleanLesson;
const lessonKey = lessonLib.lessonKey;

// ── Session state file ───────────────────────────────────────
const SESSION_STATE_DIR = path.join(PROJECT_ROOT, '.claude', '.session-state');
const SESSION_STATE_FILE = path.join(SESSION_STATE_DIR, 'stop-summary.json');
// Persists extracted lesson keys across runs/rotations to prevent re-extraction
const SEEN_LESSONS_FILE = path.join(SESSION_STATE_DIR, 'seen-lessons.json');

/**
 * Get session start timestamp. Written by session-start hook.
 */
function getSessionStartTime() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      return state.sessionStartTime || null;
    }
  } catch { /* ignore */ }
  return null;
}

// Delegate to shared module with session-state dir
function loadSeenLessonKeys() { return lessonLib.loadSeenLessonKeys(SESSION_STATE_DIR); }
function saveSeenLessonKeys(keys) { lessonLib.saveSeenLessonKeys(SESSION_STATE_DIR, keys); }


/**
 * Auto-record session content to today.md files.
 *
 * Recording principle: NO noise, ONLY signal.
 *
 * What counts as "signal" (any one triggers recording):
 * 1. Git commits during this session → record commit messages
 * 2. File changes (uncommitted edits) → record summary (count + directories, NOT file list)
 * 3. Lessons in conversation (→ pattern) → extract and record
 * 4. Decisions in conversation → extract and record
 *
 * What is NOT signal (never triggers recording alone):
 * - Pure Q&A (no file changes, no commits, no lessons)
 * - Reading/exploring code without edits
 *
 * @param {string} stdinJson - stdin content (JSON with transcript_path)
 */
function autoRecordSessionFacts(stdinJson) {
  const timestamp = getTimestamp();
  const today = getLocalDateString();
  const projectName = path.basename(PROJECT_ROOT);

  // ── 1. Collect git commits ──
  let commits = [];

  if (isGitRepo()) {
    try {
      let sinceTime = getSessionStartTime();
      if (!sinceTime) {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        sinceTime = fourHoursAgo.toISOString();
      }

      const commitLog = execFileSync('git', [
        'log', '--oneline', '--no-merges',
        `--since=${sinceTime}`,
        '--format=%h %s'
      ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim();

      if (commitLog) {
        commits = commitLog.split('\n').filter(Boolean).slice(0, 20);
      }
    } catch { /* ignore */ }
  }

  // ── 3. Extract lessons and decisions from transcript ──
  const lessons = [];
  const decisions = [];

  // Parse transcript_path from stdin JSON, then read JSONL for assistant text
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinJson);
    transcriptPath = input.transcript_path;
  } catch { /* stdin may not be valid JSON */ }
  if (!transcriptPath) {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  // Anti-circulation: use persistent state file, not today.md content.
  // today.md gets cleared/rotated, but seen-lessons.json persists (7 day TTL).
  const seenKeys = loadSeenLessonKeys();

  // Cap transcript scanning at 10MB to avoid memory issues on long sessions
  const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const stat = fs.statSync(transcriptPath);
      let raw;
      if (stat.size > MAX_TRANSCRIPT_BYTES) {
        // Read only the last 10MB (most recent messages, where lessons are likely to be)
        const fd = fs.openSync(transcriptPath, 'r');
        const buf = Buffer.alloc(MAX_TRANSCRIPT_BYTES);
        fs.readSync(fd, buf, 0, MAX_TRANSCRIPT_BYTES, stat.size - MAX_TRANSCRIPT_BYTES);
        fs.closeSync(fd);
        // Skip first partial line
        const text = buf.toString('utf8');
        raw = text.substring(text.indexOf('\n') + 1);
        log(`[StopSummary] Transcript ${(stat.size / 1024 / 1024).toFixed(1)}MB, scanning last 10MB`);
      } else {
        raw = fs.readFileSync(transcriptPath, 'utf8');
      }
      for (const jsonLine of raw.split('\n')) {
        if (!jsonLine.trim()) continue;
        let entry;
        try { entry = JSON.parse(jsonLine); } catch { continue; }

        // Only scan assistant messages (skip system injections)
        if (entry.type !== 'assistant') continue;
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type !== 'text' || !block.text) continue;

          // Track if we're inside a **Lessons:** or **Decisions:** section
          let inLessonsSection = false;
          let inDecisionsSection = false;

          for (const line of block.text.split('\n')) {
            const trimmed = line.trim();

            // Detect section headers — STRICT matching.
            // Must be the ENTIRE line: "**Lessons:**" or "### Lessons"
            // Must NOT match: "...如何确保教训被写入**。增强 promoteLessons()"
            const isLessonsHdr = /^\*{2}Lessons:?\*{2}$/.test(trimmed)
              || /^#{1,4}\s+Lessons:?\s*$/.test(trimmed);
            const isDecisionsHdr = /^\*{2}Decisions?:?\*{2}$/.test(trimmed)
              || /^\*{2}决策:?\*{2}$/.test(trimmed)
              || /^#{1,4}\s+Decisions?:?\s*$/.test(trimmed);

            if (isLessonsHdr) { inLessonsSection = true; inDecisionsSection = false; continue; }
            if (isDecisionsHdr) { inDecisionsSection = true; inLessonsSection = false; continue; }

            // Non-bullet, non-blank line ends the current section
            if ((inLessonsSection || inDecisionsSection) && trimmed !== '' && !/^[-*]\s/.test(trimmed)) {
              inLessonsSection = false; inDecisionsSection = false;
            }

            if (inLessonsSection) {
              // Match full-width → and ASCII -> / -->
              const lessonMatch = trimmed.match(/^[-*]\s+(.+(?:→|-{1,2}>).+)$/);
              if (lessonMatch && lessonMatch[1].length >= 15) {
                const cleaned = cleanLesson(lessonMatch[1]);
                const key = lessonKey(cleaned);
                if (seenKeys.has(key)) continue;
                if (lessons.some(l => lessonKey(l) === key)) continue;
                lessons.push(cleaned);
              }
            }

            // Extract decisions from **Decisions:** sections
            if (inDecisionsSection) {
              const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
              if (bulletMatch) {
                const d = cleanLesson(bulletMatch[1]);
                if (d.length >= 10 && !decisions.includes(d)) decisions.push(d);
              }
            }
          }
        }
      }
      if (lessons.length > 0 || decisions.length > 0) {
        log(`[StopSummary] Transcript scanned: ${lessons.length} new lessons, ${decisions.length} new decisions`);
      }
    } catch (err) {
      log(`[StopSummary] Transcript scan error (non-blocking): ${err.message}`);
    }
  } else {
    log('[StopSummary] No transcript_path available, skipping lesson extraction');
  }

  // ── 4. Gate: nothing meaningful → don't record ──
  // Uncommitted file changes alone are NOT signal (they're noise).
  // Only commits, lessons, and decisions trigger recording.
  const hasCommits = commits.length > 0;
  const hasLessons = lessons.length > 0;
  const hasDecisions = decisions.length > 0;

  if (!hasCommits && !hasLessons && !hasDecisions) {
    log('[StopSummary] No substantive work this session — skipping auto-record');
    return;
  }

  // ── 5. Build entry ──
  const lines = [`\n### [auto] ${timestamp} — ${projectName}`];

  // Commits
  if (hasCommits) {
    const fixes = [];
    const regular = [];
    for (const c of commits) {
      if (/^\w+\s+(fix|perf|hotfix|revert)[:(]/.test(c)) {
        fixes.push(c);
      } else {
        regular.push(c);
      }
    }

    if (regular.length > 0) {
      lines.push('**Commits:**');
      for (const c of regular) lines.push(`- \`${c}\``);
    }

    if (fixes.length > 0) {
      lines.push('**Fixes:**');
      for (const c of fixes) {
        const hash = c.split(' ')[0];
        let body = '';
        try {
          body = execFileSync('git', ['log', '-1', '--format=%b', hash], {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000
          }).trim();
        } catch { /* ignore */ }
        lines.push(`- \`${c}\``);
        if (body && body.length > 10 && body.length < 500) {
          for (const bline of body.split('\n').slice(0, 5)) {
            if (bline.trim()) lines.push(`  > ${bline.trim()}`);
          }
        }
      }
    }
  }

  // Lessons
  if (hasLessons) {
    lines.push('**Lessons:**');
    for (const l of lessons.slice(0, 10)) lines.push(`- ${l}`);
  }

  // Decisions
  if (hasDecisions) {
    lines.push('**Decisions:**');
    for (const d of decisions.slice(0, 5)) lines.push(`- ${d}`);
  }

  const entry = lines.join('\n') + '\n';

  // ── 6. Write to project today.md ──
  writeToTodayFile(MEMORY_DIR, today, entry, 'project');

  // ── 7. Write to global today.md (only lessons/decisions — project commits stay local) ──
  if (hasLessons || hasDecisions) {
    const globalLines = [`\n### [auto] ${timestamp} — ${projectName}`];
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

  // Persist extracted lesson keys so they won't be re-extracted next time
  if (hasLessons) {
    const newKeys = lessons.map(l => lessonKey(l));
    saveSeenLessonKeys(newKeys);
  }

  const parts = [];
  if (hasCommits) parts.push(`${commits.length} commits`);
  if (hasLessons) parts.push(`${lessons.length} lessons`);
  if (hasDecisions) parts.push(`${decisions.length} decisions`);
  log(`[StopSummary] Auto-recorded: ${parts.join(', ')}`);
}

/**
 * Append entry to a .memory/today.md, creating if needed.
 * Deduplicates by checking if entry timestamp already exists.
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

    // Ensure today's header exists
    if (!content.includes(`# Today — ${today}`)) {
      content = `# Today — ${today}\n\n## Sessions\n\n`;
    }

    // Dedup: match timestamp + project name to allow different projects in same minute
    const markerMatch = entry.match(/### \[auto\] (\d{2}:\d{2}) — (.+)/);
    if (markerMatch && content.includes(`[auto] ${markerMatch[1]} — ${markerMatch[2]}`)) {
      log(`[StopSummary] ${label} today.md already has entry for ${markerMatch[1]} — ${markerMatch[2]}, skipping`);
      return;
    }

    content = content.trimEnd() + '\n' + entry;
    fs.writeFileSync(todayFile, content, 'utf8');
  } catch (err) {
    log(`[StopSummary] Failed to write ${label} today.md: ${err.message}`);
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

// ── Main memory logic ────────────────────────────────────────────────

/**
 * Generic rotation for any .memory/ directory.
 * Rotates today.md → weekly.md on date change.
 */
function rotateMemoryDir(memDir, label) {
  const todayFile = path.join(memDir, 'today.md');
  const weeklyFile = path.join(memDir, 'weekly.md');

  if (!fs.existsSync(todayFile)) return;

  try {
    const content = fs.readFileSync(todayFile, 'utf8');
    if (!content.trim()) return;

    const dateMatch = content.match(/# Today\s*[-—]\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const fileDate = dateMatch[1];
    const today = getLocalDateString();

    if (fileDate === today) return;

    log(`[StopSummary] Rotating ${label} today.md (${fileDate}) → weekly.md`);
    const archiveHeader = `\n## ${fileDate}\n\n`;
    const bodyContent = content.replace(/^# Today\s*[-—]\s*\d{4}-\d{2}-\d{2}\n*/, '').trim();

    if (bodyContent) {
      if (!fs.existsSync(weeklyFile)) {
        fs.writeFileSync(weeklyFile, `# Weekly Summary\n${archiveHeader}${bodyContent}\n`, 'utf8');
      } else {
        fs.appendFileSync(weeklyFile, `${archiveHeader}${bodyContent}\n`, 'utf8');
      }
    }

    fs.writeFileSync(todayFile, `# Today — ${today}\n\n## Sessions\n\n`, 'utf8');
    log(`[StopSummary] Reset ${label} today.md for ${today}`);
  } catch (err) {
    log(`[StopSummary] ${label} rotation error (non-blocking): ${err.message}`);
  }
}

/**
 * Handle .memory/today.md maintenance — rotation only, NO content writing.
 *
 * All session content is written by Claude in-conversation (see rules/common/workflow.md#session-memory).
 * This hook ONLY:
 * 1. Rotates project .memory/today.md → weekly.md on date change
 * 2. Rotates global ~/.memory/today.md → weekly.md on date change
 */
function maintainProjectMemory() {
  // Project-level rotation
  try {
    if (fs.existsSync(MEMORY_DIR)) {
      rotateMemoryDir(MEMORY_DIR, 'project');
      log('[StopSummary] Project memory maintained (rotation check only)');
    } else {
      log('[StopSummary] Project .memory/ not found, skipping');
    }
  } catch (err) {
    log(`[StopSummary] Project memory maintenance error (non-blocking): ${err.message}`);
  }

  // Global-level rotation (~/.memory/)
  try {
    if (fs.existsSync(GLOBAL_MEMORY_DIR)) {
      rotateMemoryDir(GLOBAL_MEMORY_DIR, 'global');
      log('[StopSummary] Global memory maintained (rotation check only)');
    }
  } catch (err) {
    log(`[StopSummary] Global memory rotation error (non-blocking): ${err.message}`);
  }

  // Weekly → long-term promotion (both project and global)
  promoteWeeklyToLongTerm(MEMORY_DIR, 'project');
  promoteWeeklyToLongTerm(GLOBAL_MEMORY_DIR, 'global');
}

/**
 * Promote Lessons and Decisions from weekly.md to long-term.md.
 *
 * Scans weekly.md for **Lessons:** and **Decisions:** sections,
 * extracts their bullet items with date stamps, appends to long-term.md,
 * then trims weekly.md to keep only the last 2 weeks of content.
 *
 * Runs at most once per week (lock file per memDir).
 */
function promoteWeeklyToLongTerm(memDir, label) {
  if (!fs.existsSync(memDir)) return;

  const weeklyFile = path.join(memDir, 'weekly.md');
  const longTermFile = path.join(memDir, 'long-term.md');
  const lockFile = path.join(memDir, '.weekly-promote-lock');

  if (!fs.existsSync(weeklyFile)) return;

  try {
    // Weekly throttle: run at most once per week
    if (fs.existsSync(lockFile)) {
      const lockWeek = fs.readFileSync(lockFile, 'utf8').trim();
      const currentWeek = getISOWeek();
      if (lockWeek === currentWeek) return;
    }

    const content = fs.readFileSync(weeklyFile, 'utf8');

    // Find all date-stamped sections and their content
    const sections = content.split(/\n(?=## \d{4})/);
    if (sections.length < 2) return; // nothing to promote yet

    const today = getLocalDateString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const cutoffDate = `${twoWeeksAgo.getFullYear()}-${String(twoWeeksAgo.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksAgo.getDate()).padStart(2, '0')}`;

    // Separate old sections (to promote from) and recent sections (to keep)
    const header = sections[0]; // "# Weekly Summary\n\n> ..."
    const toPromote = [];
    const toKeep = [header];

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      // Extract the date from section header: "## 2026-W13 ..." or "## 2026-04-05"
      const dateMatch = section.match(/## (\d{4}-\d{2}-\d{2})|## \d{4}-W(\d+)/);
      let sectionDate = null;

      if (dateMatch) {
        if (dateMatch[1]) {
          sectionDate = dateMatch[1];
        } else if (dateMatch[2]) {
          // Week number — extract dates from subsection headers
          const subDates = [...section.matchAll(/### (\d{4}-\d{2}-\d{2})/g)];
          if (subDates.length > 0) {
            sectionDate = subDates[subDates.length - 1][1]; // latest date in section
          }
        }
      }

      if (sectionDate && sectionDate <= cutoffDate) {
        toPromote.push(section);
      } else {
        toKeep.push(section);
      }
    }

    if (toPromote.length === 0) {
      fs.writeFileSync(lockFile, getISOWeek(), 'utf8');
      return;
    }

    // Extract Lessons and Decisions from old sections
    const newLessons = [];
    const newDecisions = [];

    for (const section of toPromote) {
      // Find date context for this section
      const dateCtx = section.match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateCtx ? dateCtx[1] : 'unknown';

      let inLessons = false;
      let inDecisions = false;

      for (const line of section.split('\n')) {
        const trimmed = line.trim();

        // Section header detection (same strict rules as transcript scanning)
        if (/^\*{2}Lessons:?\*{2}$/.test(trimmed)) { inLessons = true; inDecisions = false; continue; }
        if (/^\*{2}Decisions?:?\*{2}$/.test(trimmed)) { inDecisions = true; inLessons = false; continue; }
        if ((inLessons || inDecisions) && trimmed !== '' && !/^[-*]\s/.test(trimmed)) {
          inLessons = false; inDecisions = false;
        }

        if (inLessons && /^[-*]\s+/.test(trimmed)) {
          const item = cleanLesson(trimmed.replace(/^[-*]\s+/, '')).replace(/^\[[\d-]+\]\s*/, '');
          if (item.length >= 10) {
            newLessons.push(`- [${date}] ${item}`);
          }
        }
        if (inDecisions && /^[-*]\s+/.test(trimmed)) {
          const item = cleanLesson(trimmed.replace(/^[-*]\s+/, '')).replace(/^\[[\d-]+\]\s*/, '');
          if (item.length >= 10) {
            newDecisions.push(`- [${date}] ${item}`);
          }
        }
      }
    }

    if (newLessons.length === 0 && newDecisions.length === 0) {
      // Nothing to promote, but still trim weekly
      fs.writeFileSync(weeklyFile, toKeep.join('\n'), 'utf8');
      fs.writeFileSync(lockFile, getISOWeek(), 'utf8');
      log(`[StopSummary] ${label} weekly trimmed (${toPromote.length} old sections removed, nothing to promote)`);
      return;
    }

    // Read or create long-term.md
    let ltContent = '';
    if (fs.existsSync(longTermFile)) {
      ltContent = fs.readFileSync(longTermFile, 'utf8');
    }

    if (!ltContent.includes('# Long-Term Memory')) {
      ltContent = '# Long-Term Memory\n\n> 从 weekly.md 自动沉淀的经验教训和架构决策。\n\n## Lessons Learned\n\n## Architecture Decisions\n';
    }

    // Dedup against existing long-term content
    const existingKeys = new Set();
    for (const line of ltContent.split('\n')) {
      const m = line.match(/^-\s+\[[\d-]+\]\s+(.+)/);
      if (m) {
        const key = m[1].match(/(.+?)(?:→|-{1,2}>)/) ? m[1].match(/(.+?)(?:→|-{1,2}>)/)[1].trim().toLowerCase() : m[1].trim().toLowerCase();
        existingKeys.add(key);
      }
    }

    const filteredLessons = newLessons.filter(l => {
      const m = l.match(/^-\s+\[[\d-]+\]\s+(.+)/);
      if (!m) return true;
      const key = lessonKey(m[1]);
      return !existingKeys.has(key);
    });

    const filteredDecisions = newDecisions.filter(d => {
      const m = d.match(/^-\s+\[[\d-]+\]\s+(.+)/);
      if (!m) return true;
      const key = m[1].trim().toLowerCase();
      return !existingKeys.has(key);
    });

    // Append to long-term.md
    if (filteredLessons.length > 0) {
      if (ltContent.includes('## Lessons Learned')) {
        ltContent = ltContent.replace(
          '## Lessons Learned\n',
          `## Lessons Learned\n${filteredLessons.join('\n')}\n`
        );
      } else {
        ltContent += `\n## Lessons Learned\n${filteredLessons.join('\n')}\n`;
      }
    }

    if (filteredDecisions.length > 0) {
      if (ltContent.includes('## Architecture Decisions')) {
        ltContent = ltContent.replace(
          '## Architecture Decisions\n',
          `## Architecture Decisions\n${filteredDecisions.join('\n')}\n`
        );
      } else {
        ltContent += `\n## Architecture Decisions\n${filteredDecisions.join('\n')}\n`;
      }
    }

    fs.writeFileSync(longTermFile, ltContent, 'utf8');

    // Trim weekly.md
    fs.writeFileSync(weeklyFile, toKeep.join('\n'), 'utf8');
    fs.writeFileSync(lockFile, getISOWeek(), 'utf8');

    log(`[StopSummary] ${label} weekly→long-term: ${filteredLessons.length} lessons, ${filteredDecisions.length} decisions promoted, ${toPromote.length} old sections trimmed`);
  } catch (err) {
    log(`[StopSummary] ${label} weekly→long-term error (non-blocking): ${err.message}`);
  }
}

/**
 * Get ISO week string: "2026-W15"
 */
function getISOWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Update ~/.memory/index.md with current project info.
 * Creates ~/.memory/ if it doesn't exist.
 * Format: markdown table with project name, path, last active, has .memory/
 */
function updateGlobalIndex() {
  try {
    if (!fs.existsSync(GLOBAL_MEMORY_DIR)) {
      fs.mkdirSync(GLOBAL_MEMORY_DIR, { recursive: true });
    }

    const projectName = path.basename(PROJECT_ROOT);
    const hasMemory = fs.existsSync(MEMORY_DIR) ? 'Yes' : 'No';
    const now = getLocalDateString() + ' ' + getTimestamp();

    // Read existing index or create new
    let content = '';
    if (fs.existsSync(GLOBAL_INDEX_FILE)) {
      content = fs.readFileSync(GLOBAL_INDEX_FILE, 'utf8');
    }

    if (!content.includes('| Project |')) {
      // Create new index with header (5-column format with Host)
      content = `# Global Memory Index\n\n| Project | Host | Path | Last Active | Has .memory/ |\n|---------|------|------|-------------|-------------|\n`;
    }

    const hostname = require('os').hostname();

    // Match any row containing this exact path in ANY column position
    const escapedPath = PROJECT_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`^\\|.*\\|\\s*${escapedPath}\\s*\\|.*$`, 'gm');

    const newRow = `| ${projectName} | ${hostname} | ${PROJECT_ROOT} | ${now} | ${hasMemory} |`;

    // Remove ALL existing rows for this path (handles duplicates from schema change)
    const matches = content.match(rowRegex);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        content = content.replace(m + '\n', '');
      }
    }
    // Append the single updated row
    content = content.trimEnd() + '\n' + newRow + '\n';

    fs.writeFileSync(GLOBAL_INDEX_FILE, content, 'utf8');
    log(`[StopSummary] Global index updated: ${projectName}`);
  } catch (err) {
    log(`[StopSummary] Global index update failed (non-blocking): ${err.message}`);
  }
}

// ── Error Lessons Auto-Promote ───────────────────────────────

const PROMOTE_LOCK = path.join(PROJECT_ROOT, '.claude', '.promote-lock');
const PROMOTE_MARKER = '[auto]';

/**
 * Scan .memory/ files for repeated "→" pattern lessons.
 * If a lesson appears 2+ times across memory files, auto-append to CLAUDE.md.
 * Runs at most once per day (lock file).
 * Writes to BOTH CLAUDE.md files (root + .claude/) for consistency.
 */
function promoteLessons() {
  try {
    // Daily throttle
    if (fs.existsSync(PROMOTE_LOCK)) {
      const lockDate = fs.readFileSync(PROMOTE_LOCK, 'utf8').trim();
      if (lockDate === getLocalDateString()) return;
    }

    // Scan memory files for "→" pattern lessons
    const memoryFiles = [TODAY_FILE, WEEKLY_FILE, path.join(MEMORY_DIR, 'long-term.md')];
    const lessonCounts = {};  // lesson text → count

    for (const file of memoryFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      // Section-scoped scanning: only count lessons under **Lessons:** headers
      let inLessonsSection = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // Detect section headers (same strict rules as transcript scanning)
        if (/^\*{2}Lessons:?\*{2}$/.test(trimmed)) { inLessonsSection = true; continue; }
        // Any other bold header (including Chinese like **决策:**) or markdown heading ends the section
        if (/^\*{2}[^*]+:?\*{2}$/.test(trimmed) || /^#{1,4}\s+/.test(trimmed)) { inLessonsSection = false; continue; }
        if (inLessonsSection && trimmed !== '' && !/^[-*]\s/.test(trimmed)) { inLessonsSection = false; }

        if (!inLessonsSection) continue;
        // Match lines with → pattern (error → fix format)
        const match = trimmed.match(/^[-*]\s+(.+(?:→|-{1,2}>).+)$/);
        if (match) {
          const cleaned = cleanLesson(match[1]);
          // Skip already-promoted lessons and very short ones
          if (cleaned.includes(PROMOTE_MARKER)) continue;
          if (cleaned.length < 10) continue;
          // Dedup by lesson key (left side of →)
          const key = lessonKey(cleaned);
          lessonCounts[key] = lessonCounts[key] || { text: cleaned, count: 0 };
          lessonCounts[key].count++;
        }
      }
    }

    // Find lessons appearing 2+ times
    const candidates = Object.values(lessonCounts)
      .filter(({ count }) => count >= 2)
      .map(({ text }) => text)
      .slice(0, 5);  // Max 5 per day

    if (candidates.length === 0) {
      // Touch lock even if nothing to promote (prevent re-scanning today)
      fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
      return;
    }

    // Read CLAUDE.md and check which lessons are already there
    const claudeMdFiles = [
      path.join(PROJECT_ROOT, 'CLAUDE.md'),
      path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md'),
    ];

    const rootClaudeMd = claudeMdFiles[0];
    if (!fs.existsSync(rootClaudeMd)) {
      fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
      return;
    }

    const claudeContent = fs.readFileSync(rootClaudeMd, 'utf8');
    const today = getLocalDateString();
    // Dedup by lesson key against CLAUDE.md content (not exact text match)
    const newLessons = candidates.filter(lesson => {
      const key = lessonKey(lesson);
      // Check if any existing line in CLAUDE.md has the same lesson key
      for (const cLine of claudeContent.split('\n')) {
        const m = cLine.match(/^-\s+(.+(?:→|-{1,2}>).+)$/);
        if (m && lessonKey(cleanLesson(m[1])) === key) return false;
      }
      return true;
    });

    if (newLessons.length === 0) {
      fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
      return;
    }

    // Append to both CLAUDE.md files
    // Strip existing date prefix before re-adding (avoid "[2026-04-12] [2026-04-12] ...")
    const entries = newLessons.map(l => {
      const stripped = l.replace(/^\[[\d-]+\]\s*/, '');
      return `- [${today}] ${stripped} ${PROMOTE_MARKER}`;
    }).join('\n');
    const marker = '<!-- 新错误追加在此行下方 -->';

    for (const file of claudeMdFiles) {
      if (!fs.existsSync(file)) continue;
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes(marker)) {
        content = content.replace(marker, `${marker}\n${entries}`);
      } else if (content.includes('\n---\n\n## Sources')) {
        content = content.replace(/\n---\n\n## Sources/, `\n${entries}\n\n---\n\n## Sources`);
      } else {
        // Final fallback: append to end of file
        content = content.trimEnd() + `\n\n${entries}\n`;
      }
      fs.writeFileSync(file, content, 'utf8');
    }

    log(`[StopSummary] Promoted ${newLessons.length} lesson(s) to CLAUDE.md`);
    fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
  } catch (err) {
    log(`[StopSummary] Lesson promotion error (non-blocking): ${err.message}`);
  }
}

function main(conversationText) {
  // Rotate FIRST — archive yesterday's today.md before writing new content
  maintainProjectMemory();

  // Then record this session's content
  autoRecordSessionFacts(conversationText);

  checkConsoleLogs();

  // Update global memory index (~/.memory/index.md)
  updateGlobalIndex();

  // Auto-promote repeated error lessons to CLAUDE.md (daily)
  promoteLessons();

  // Push shared memory to remote (if configured)
  try {
    const memorySync = require('../lib/memory-sync');
    if (memorySync.isEnabled()) {
      memorySync.push();
    }
  } catch (err) {
    log(`[StopSummary] Memory sync push skipped: ${err.message}`);
  }

  log('[StopSummary] Done');
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
    main(stdinData);
  } catch (err) {
    log(`[StopSummary] Error: ${err.message}`);
  }
  // Always pass through stdin → stdout
  process.stdout.write(stdinData);
  process.exit(0);
});
