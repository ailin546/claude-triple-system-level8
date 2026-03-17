#!/usr/bin/env node
/**
 * Sprint Memory Hook (Stop)
 *
 * Maintains a rolling "mid-term memory" file per sprint/week.
 * Captures decisions, unfinished work, and lessons learned
 * that persist across sessions but within a development sprint.
 *
 * File: .claude/memory/sprint-YYYY-WNN.md (ISO week number)
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const path = require('path');
const fs = require('fs');

const MEMORY_DIR = path.join(process.cwd(), '.claude', 'memory');
const SHARED_STATE_DIR = path.join(process.cwd(), '.claude', 'shared-state');
const BOARD_PATH = path.join(SHARED_STATE_DIR, 'board.json');

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7) + 1;
}

function getSprintId() {
  const now = new Date();
  const week = getISOWeek(now);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function createSprintTemplate(sprintId) {
  return `# Sprint Memory: ${sprintId}

**Created:** ${getDateString()}
**Last Updated:** ${getDateString()}
**Project:** ${path.basename(process.cwd())}

---

## Decisions Made

<!-- Append new decisions below. Format: - [date] decision — reason -->

---

## Unfinished Work

<!-- Auto-updated from board.json. Format: - [date] task description (status) -->

---

## Lessons Learned

<!-- Patterns discovered, pitfalls to avoid. Format: - [date] lesson -->

---

## Architecture Notes

<!-- Key architectural context for this sprint -->

---

## Environment Notes

<!-- Dev environment quirks, CI issues, dependency notes -->
`;
}

function appendToSection(content, sectionHeader, newLine) {
  const sectionRegex = new RegExp(`(## ${sectionHeader}\\n\\n(?:<!-- [^>]+ -->\\n)?)(\\n---)`);
  const match = content.match(sectionRegex);

  if (match) {
    // Insert before the next ---
    const insertPoint = content.indexOf(match[2], content.indexOf(match[1]));
    return content.slice(0, insertPoint) + newLine + '\n' + content.slice(insertPoint);
  }

  // Fallback: append before last ---
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator !== -1) {
    return content.slice(0, lastSeparator) + '\n' + newLine + content.slice(lastSeparator);
  }

  return content + '\n' + newLine;
}

function main() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  const sprintId = getSprintId();
  const sprintFile = path.join(MEMORY_DIR, `sprint-${sprintId}.md`);
  const today = getDateString();

  // Create sprint file if it doesn't exist
  let content;
  if (fs.existsSync(sprintFile)) {
    content = fs.readFileSync(sprintFile, 'utf8');
  } else {
    content = createSprintTemplate(sprintId);
  }

  // Update "Last Updated" date
  content = content.replace(
    /\*\*Last Updated:\*\* .+/,
    `**Last Updated:** ${today}`
  );

  // Sync unfinished work from board.json
  if (fs.existsSync(BOARD_PATH)) {
    const board = readJSON(BOARD_PATH);
    if (board && board.tasks && board.tasks.length > 0) {
      const pendingTasks = board.tasks.filter(t =>
        t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked'
      );

      if (pendingTasks.length > 0) {
        // Clear and rebuild unfinished work section
        const sectionStart = content.indexOf('## Unfinished Work');
        const sectionEnd = content.indexOf('\n---', sectionStart);

        if (sectionStart !== -1 && sectionEnd !== -1) {
          const header = '## Unfinished Work\n\n<!-- Auto-updated from board.json. Format: - [date] task description (status) -->\n';
          const taskLines = pendingTasks.map(t =>
            `- [${today}] ${t.description} (${t.status})`
          ).join('\n');

          content = content.slice(0, sectionStart) + header + taskLines + '\n' + content.slice(sectionEnd);
        }
      }
    }
  }

  fs.writeFileSync(sprintFile, content, 'utf8');
}

// Read stdin (Claude Code hook protocol) then run
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk.substring(0, 1024 * 1024); });
process.stdin.on('end', () => {
  try { main(); } catch (err) {
    console.error('[SprintMemory] Error:', err.message);
  }
  process.exit(0);
});
