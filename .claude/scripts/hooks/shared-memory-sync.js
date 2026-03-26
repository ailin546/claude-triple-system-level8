#!/usr/bin/env node
/**
 * Shared Memory Sync Hook (Stop)
 *
 * Appends a session summary entry to the cross-tool shared memory file:
 *   {project}/.memory/today.md
 *
 * Also handles daily rotation:
 *   - If today.md's date header != today → archive to weekly.md, reset today.md
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const path = require('path');
const fs = require('fs');

// ── Mode gate: Heavy only ────────────────────────────────────
try {
  const { requireMode } = require('../lib/mode-check');
  if (!requireMode('heavy')) {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { d += c; });
    process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
    return;
  }
} catch { /* mode-check not available — run anyway */ }
// ─────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(process.cwd(), '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

function getTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7) + 1;
}

function getISOWeekYear(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

function getWeekId(date) {
  const week = getISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getDayName(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr).getDay()];
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractDateFromToday(content) {
  const match = content.match(/^# Today — (\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function extractSessionSummaries(content) {
  const lines = content.split('\n');
  const summaries = [];
  let inSession = false;

  for (const line of lines) {
    if (line.startsWith('### [')) {
      inSession = true;
      continue;
    }
    if (inSession && line.startsWith('- ')) {
      summaries.push(line);
    }
    if (inSession && line.trim() === '' && summaries.length > 0) {
      inSession = false;
    }
  }

  return summaries;
}

function archiveTodayToWeekly(todayContent, todayDate) {
  const summaries = extractSessionSummaries(todayContent);
  if (summaries.length === 0) return;

  const dayName = getDayName(todayDate);
  const entry = `\n## ${todayDate} (${dayName})\n${summaries.join('\n')}\n`;

  let weeklyContent = readFile(WEEKLY_FILE);
  const weekId = getWeekId(new Date(todayDate));

  if (!weeklyContent) {
    weeklyContent = `# Weekly Summary — ${weekId}\n\n> 本周工作摘要。从 today.md 每日归档沉淀。保留 2 周后归档到 long-term.md.\n`;
  }

  // Update week ID in header if changed
  weeklyContent = weeklyContent.replace(
    /^# Weekly Summary — .+/,
    `# Weekly Summary — ${weekId}`
  );

  // Append day entry (avoid duplicates)
  if (!weeklyContent.includes(`## ${todayDate}`)) {
    // Insert before "## Decisions" or "## Open Items" if they exist, otherwise append
    const decisionsIdx = weeklyContent.indexOf('\n## Decisions');
    if (decisionsIdx !== -1) {
      weeklyContent = weeklyContent.slice(0, decisionsIdx) + entry + weeklyContent.slice(decisionsIdx);
    } else {
      weeklyContent += entry;
    }
  }

  fs.writeFileSync(WEEKLY_FILE, weeklyContent, 'utf8');
}

function createTodayTemplate(date) {
  return `# Today — ${date}

> 每日工作日志，所有 AI 工具共同读写。次日自动归档到 weekly.md。

## Sessions
`;
}

function extractSummaryFromStdin(stdinData) {
  // Try to extract meaningful info from the hook's stdin (JSON with transcript_summary)
  try {
    const data = JSON.parse(stdinData);
    if (data.transcript_summary) {
      return data.transcript_summary;
    }
  } catch {
    // Not JSON or no summary field
  }
  return null;
}

function main(stdinData) {
  if (!fs.existsSync(MEMORY_DIR)) {
    // .memory dir doesn't exist — skip silently
    return;
  }

  const today = getDateString();
  const time = getTimeString();

  let todayContent = readFile(TODAY_FILE);

  // Daily rotation: archive old today.md to weekly.md
  if (todayContent) {
    const fileDate = extractDateFromToday(todayContent);
    if (fileDate && fileDate !== today) {
      archiveTodayToWeekly(todayContent, fileDate);
      todayContent = createTodayTemplate(today);
    }
  } else {
    todayContent = createTodayTemplate(today);
  }

  // Append session entry
  const summary = extractSummaryFromStdin(stdinData);
  if (summary) {
    const entry = `\n### [Claude Code] ${time}\n- ${summary}\n`;
    todayContent += entry;
  } else {
    // Minimal entry — just mark that a session happened
    const entry = `\n### [Claude Code] ${time}\n- Session ended\n`;
    todayContent += entry;
  }

  fs.writeFileSync(TODAY_FILE, todayContent, 'utf8');
}

// Read stdin (Claude Code hook protocol) then run
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
  try { main(stdinData); } catch (err) {
    console.error('[SharedMemorySync] Error:', err.message);
  }
  process.exit(0);
});
