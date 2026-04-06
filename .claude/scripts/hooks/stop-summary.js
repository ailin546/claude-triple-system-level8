#!/usr/bin/env node
/**
 * Stop Hook (Always-on):
 * 1. Check for console.log in modified files
 * 2. Rotate .memory/today.md → weekly.md on date change
 * 3. Update ~/.memory/index.md (global project index)
 * 4. Push to remote (if configured)
 *
 * Does NOT write session content to today.md — that's Claude's job
 * (see rules/common/session-memory.md).
 *
 * Cross-platform. Non-blocking: errors never block exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log, getProjectRoot, getGlobalMemoryDir } = require('../lib/utils');

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

/* rotateTodayIfNeeded removed — replaced by rotateMemoryDir() below */

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
 * Rotate a specific today.md → weekly.md on date change.
 * @param {string} todayFile - path to today.md
 * @param {string} weeklyFile - path to weekly.md
 * @param {string} label - log label
 */
function rotateMemoryDir(todayFile, weeklyFile, label) {
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
 * All session content is written by Claude in-conversation (see rules/common/session-memory.md).
 * This hook ONLY:
 * 1. Rotates today.md → weekly.md on date change (both project + global)
 * 2. Creates today.md template if missing after rotation
 */
function maintainProjectMemory() {
  // Project-level .memory/
  try {
    if (fs.existsSync(MEMORY_DIR)) {
      rotateMemoryDir(TODAY_FILE, WEEKLY_FILE, 'project');
      log('[StopSummary] Project memory maintained (rotation check only)');
    } else {
      log('[StopSummary] .memory/ not found, skipping project rotation');
    }
  } catch (err) {
    log(`[StopSummary] Project memory maintenance error (non-blocking): ${err.message}`);
  }

  // Global ~/.memory/
  try {
    const globalToday = path.join(GLOBAL_MEMORY_DIR, 'today.md');
    const globalWeekly = path.join(GLOBAL_MEMORY_DIR, 'weekly.md');
    if (fs.existsSync(GLOBAL_MEMORY_DIR)) {
      rotateMemoryDir(globalToday, globalWeekly, 'global');
      log('[StopSummary] Global memory maintained (rotation check only)');
    }
  } catch (err) {
    log(`[StopSummary] Global memory maintenance error (non-blocking): ${err.message}`);
  }
}

/**
 * Generate a short summary from git-modified files.
 * Groups by directory/extension and returns a human-readable one-liner.
 * @returns {string} e.g. "hooks/3, rules/1, memory/2" or "no changes"
 */
function getChangeSummary() {
  try {
    const files = getGitModifiedFiles();
    if (files.length === 0) return 'no changes';

    // Group by top-level directory relative to project root
    const groups = {};
    for (const f of files) {
      const rel = path.relative(PROJECT_ROOT, f);
      const parts = rel.split(path.sep);
      // Use first meaningful directory or filename
      let key;
      if (parts.length === 1) {
        key = path.extname(parts[0]) || 'root';
      } else if (parts[0] === '.claude' && parts.length > 2) {
        key = parts[1]; // e.g. "scripts", "rules", "skills"
      } else {
        key = parts[0];
      }
      groups[key] = (groups[key] || 0) + 1;
    }

    // Format: "scripts/3, rules/1" (top 4 groups)
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return sorted.map(([k, v]) => `${k}/${v}`).join(', ') + ` (${files.length} files)`;
  } catch {
    return 'unknown';
  }
}

/**
 * Update ~/.memory/index.md with current project info and change summary.
 * Creates ~/.memory/ if it doesn't exist.
 * Format: markdown table with project name, path, last active, summary
 */
function updateGlobalIndex() {
  try {
    if (!fs.existsSync(GLOBAL_MEMORY_DIR)) {
      fs.mkdirSync(GLOBAL_MEMORY_DIR, { recursive: true });
    }

    const os = require('os');
    const projectName = path.basename(PROJECT_ROOT);
    const host = os.hostname();
    const now = getLocalDateString() + ' ' + getTimestamp();
    const summary = getChangeSummary();

    // Read existing index or create new
    let content = '';
    if (fs.existsSync(GLOBAL_INDEX_FILE)) {
      content = fs.readFileSync(GLOBAL_INDEX_FILE, 'utf8');
    }

    // Migrate old formats to new 5-column format with Host
    if (content.includes('| Has .memory/ |') || (content.includes('| Changes |') && !content.includes('| Host |'))) {
      // Full rebuild of header
      const lines = content.split('\n');
      const dataLines = lines.filter(l => l.startsWith('|') && !l.startsWith('| Project') && !l.startsWith('|---'));
      content = `# Global Memory Index\n\n| Project | Host | Path | Last Active | Changes |\n|---------|------|------|-------------|--------|\n`;
      // Re-add data lines with unknown host
      for (const line of dataLines) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          content += `| ${cols[0]} | unknown | ${cols[1]} | ${cols[2]} | ${cols[3] || ''} |\n`;
        }
      }
    }

    if (!content.includes('| Project |')) {
      content = `# Global Memory Index\n\n| Project | Host | Path | Last Active | Changes |\n|---------|------|------|-------------|--------|\n`;
    }

    // Match by project path + host (same project on different hosts = different rows)
    const escapedPath = PROJECT_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedHost = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`^\\|[^|]*\\|\\s*${escapedHost}\\s*\\|\\s*${escapedPath}\\s*\\|.*$`, 'm');

    const newRow = `| ${projectName} | ${host} | ${PROJECT_ROOT} | ${now} | ${summary} |`;

    if (rowRegex.test(content)) {
      content = content.replace(rowRegex, newRow);
    } else {
      content = content.trimEnd() + '\n' + newRow + '\n';
    }

    fs.writeFileSync(GLOBAL_INDEX_FILE, content, 'utf8');
    log(`[StopSummary] Global index updated: ${projectName}@${host} — ${summary}`);
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
      for (const line of lines) {
        // Match lines with → pattern (error → fix format)
        const match = line.match(/^-\s+(.+→.+)$/);
        if (match) {
          const lesson = match[1].trim();
          // Skip already-promoted lessons and very short ones
          if (lesson.includes(PROMOTE_MARKER)) continue;
          if (lesson.length < 10) continue;
          lessonCounts[lesson] = (lessonCounts[lesson] || 0) + 1;
        }
      }
    }

    // Find lessons appearing 2+ times
    const candidates = Object.entries(lessonCounts)
      .filter(([, count]) => count >= 2)
      .map(([lesson]) => lesson)
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
    const newLessons = candidates.filter(lesson => !claudeContent.includes(lesson));

    if (newLessons.length === 0) {
      fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
      return;
    }

    // Append to both CLAUDE.md files
    const entries = newLessons.map(l => `- [${today}] ${l} ${PROMOTE_MARKER}`).join('\n');
    const marker = '<!-- 新错误追加在此行下方 -->';

    for (const file of claudeMdFiles) {
      if (!fs.existsSync(file)) continue;
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes(marker)) {
        content = content.replace(marker, `${marker}\n${entries}`);
      } else {
        // Fallback: append before Sources section
        content = content.replace(/\n---\n\n## Sources/, `\n${entries}\n\n---\n\n## Sources`);
      }
      fs.writeFileSync(file, content, 'utf8');
    }

    log(`[StopSummary] Promoted ${newLessons.length} lesson(s) to CLAUDE.md`);
    fs.writeFileSync(PROMOTE_LOCK, getLocalDateString(), 'utf8');
  } catch (err) {
    log(`[StopSummary] Lesson promotion error (non-blocking): ${err.message}`);
  }
}

function main() {
  checkConsoleLogs();

  // Maintain project .memory/ (rotation only, no content writing)
  maintainProjectMemory();

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
    main();
  } catch (err) {
    log(`[StopSummary] Error: ${err.message}`);
  }
  // Always pass through stdin → stdout
  process.stdout.write(stdinData);
  process.exit(0);
});
