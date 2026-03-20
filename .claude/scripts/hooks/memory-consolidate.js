#!/usr/bin/env node
/**
 * Memory Consolidate Hook (Stop)
 *
 * Scans expired sprint files (>2 weeks old) and consolidates
 * their decisions, lessons, and architecture notes into
 * .claude/memory/long-term.md for permanent project memory.
 *
 * Frequency: once per day (lock file based).
 * Cross-platform (Windows, macOS, Linux).
 */

const path = require('path');
const fs = require('fs');

const MEMORY_DIR = path.join(process.cwd(), '.claude', 'memory');
const LONG_TERM_FILE = path.join(MEMORY_DIR, 'long-term.md');
const LOCK_FILE = path.join(MEMORY_DIR, '.consolidate-lock');

const SECTIONS_TO_EXTRACT = [
  'Decisions Made',
  'Lessons Learned',
  'Architecture Notes'
];

const SECTION_MAP = {
  'Decisions Made': 'Architecture Decisions',
  'Lessons Learned': 'Lessons Learned',
  'Architecture Notes': 'Architecture Decisions'
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

function shouldRun() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stat = fs.statSync(LOCK_FILE);
      if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
        return false;
      }
    }
  } catch {
    // If we can't read the lock, proceed
  }
  return true;
}

function touchLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, getDateString(), 'utf8');
}

function createLongTermTemplate() {
  const projectName = path.basename(process.cwd());
  return `# Project Long-Term Memory

**Project:** ${projectName}
**Last Updated:** ${getDateString()}

---

## Architecture Decisions
<!-- 从 sprint 沉淀的架构决策 -->

## Coding Conventions
<!-- 项目编码约定 -->

## Known Gotchas
<!-- 已知陷阱和注意事项 -->

## Lessons Learned
<!-- 从 sprint 沉淀的经验教训 -->
`;
}

function parseSprintWeekDate(filename) {
  // sprint-YYYY-WNN.md -> Monday of that ISO week
  // Uses same algorithm as sprint-memory.js getISOWeek/getISOWeekYear
  const match = filename.match(/sprint-(\d{4})-W(\d{2})\.md$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // Validate ISO week range (1-53)
  if (week < 1 || week > 53) return null;

  // ISO 8601: Jan 4 is always in week 1. Find Monday of week 1, then offset.
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const dow = jan4.getDay() || 7; // Convert Sunday=0 to 7
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dow + 1);
  const mondayTargetWeek = new Date(mondayWeek1);
  mondayTargetWeek.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return mondayTargetWeek;
}

function isExpired(filename) {
  const weekDate = parseSprintWeekDate(filename);
  if (!weekDate) return false;
  return (Date.now() - weekDate.getTime()) > TWO_WEEKS_MS;
}

function isAlreadyConsolidated(content) {
  // Check last 200 chars for the marker to avoid false positives from user content
  const tail = content.slice(-200);
  return /<!-- consolidated: \d{4}-\d{2}-\d{2} -->/.test(tail);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(content, sectionName) {
  const escaped = escapeRegex(sectionName);
  // Match section until next "---" line or next "## " header
  const regex = new RegExp(
    `## ${escaped}\\n(?:<!--[^>]*-->\\n)?\\n?([\\s\\S]*?)(?=\\n---\\n|\\n## |$)`
  );
  const match = content.match(regex);
  if (!match) return [];

  const body = match[1].trim();
  if (!body) return [];

  // Extract lines that start with "- "
  return body
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim());
}

function appendToSection(longTermContent, targetSection, entries) {
  if (entries.length === 0) return longTermContent;

  const sectionHeader = `## ${targetSection}`;
  const idx = longTermContent.indexOf(sectionHeader);
  if (idx === -1) return longTermContent;

  // Find the end of the comment line after the header
  const afterHeader = longTermContent.indexOf('\n', idx);
  if (afterHeader === -1) return longTermContent;

  // Find position after comment (if any) to insert
  let insertPos = afterHeader + 1;
  const nextLine = longTermContent.indexOf('\n', insertPos);
  if (nextLine !== -1) {
    const line = longTermContent.substring(insertPos, nextLine).trim();
    if (line.startsWith('<!--')) {
      insertPos = nextLine + 1;
    }
  }

  const newEntries = entries.join('\n') + '\n';
  return longTermContent.slice(0, insertPos) + newEntries + longTermContent.slice(insertPos);
}

function main() {
  if (!fs.existsSync(MEMORY_DIR)) return;
  if (!shouldRun()) return;

  // Find expired sprint files
  const files = fs.readdirSync(MEMORY_DIR)
    .filter(f => f.startsWith('sprint-') && f.endsWith('.md'));

  const expiredFiles = files.filter(f => isExpired(f));
  if (expiredFiles.length === 0) {
    touchLock();
    return;
  }

  // Load or create long-term memory
  let longTerm;
  if (fs.existsSync(LONG_TERM_FILE)) {
    longTerm = fs.readFileSync(LONG_TERM_FILE, 'utf8');
  } else {
    longTerm = createLongTermTemplate();
  }

  // Collect entries from all expired sprints first, then write in safe order:
  // 1. Write long-term.md first (target)
  // 2. Mark sprint files after (source)
  // This way, a crash between steps causes at most duplicate entries, never data loss.
  const toMarkWithEntries = [];
  const toMarkEmpty = [];

  for (const file of expiredFiles) {
    const filePath = path.join(MEMORY_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    if (isAlreadyConsolidated(content)) continue;

    let hasEntries = false;

    for (const section of SECTIONS_TO_EXTRACT) {
      const entries = extractSection(content, section);
      if (entries.length > 0) {
        const targetSection = SECTION_MAP[section];
        // Include source section name when it differs from target to preserve context
        const sourceTag = section !== targetSection ? `[${section}] ` : '';
        const tagged = entries.map(e => `${e} *(${sourceTag}from ${file})*`);
        longTerm = appendToSection(longTerm, targetSection, tagged);
        hasEntries = true;
      }
    }

    if (hasEntries) {
      toMarkWithEntries.push({ filePath, content });
    } else {
      // Empty sprints also get marked to avoid re-parsing every day
      toMarkEmpty.push({ filePath, content });
    }
  }

  if (toMarkWithEntries.length > 0) {
    // Step 1: Write long-term.md first (safe: duplicate on crash, no data loss)
    longTerm = longTerm.replace(
      /\*\*Last Updated:\*\* .+/,
      `**Last Updated:** ${getDateString()}`
    );
    fs.writeFileSync(LONG_TERM_FILE, longTerm, 'utf8');

    // Step 2: Mark sprint files as consolidated
    const marker = `\n<!-- consolidated: ${getDateString()} -->\n`;
    for (const { filePath, content } of toMarkWithEntries) {
      fs.writeFileSync(filePath, content + marker, 'utf8');
    }
  }

  // Mark empty expired sprints too, to avoid re-parsing them every day
  if (toMarkEmpty.length > 0) {
    const marker = `\n<!-- consolidated: ${getDateString()} (empty) -->\n`;
    for (const { filePath, content } of toMarkEmpty) {
      fs.writeFileSync(filePath, content + marker, 'utf8');
    }
  }

  touchLock();
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
  try { main(); } catch (err) {
    console.error('[MemoryConsolidate] Error:', err.message);
  }
  process.exit(0);
});
