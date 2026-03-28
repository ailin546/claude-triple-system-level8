#!/usr/bin/env node
/**
 * Memory Promote Hook (Stop)
 *
 * Two responsibilities:
 * 1. (Original) Promote project-scoped instincts to global via instinct-cli.py
 * 2. (New) Auto-promote recurring memory patterns to CLAUDE.md 错误教训日志
 *
 * Frequency: once per day (lock file based).
 * Cross-platform (Windows, macOS, Linux).
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

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
} catch {
  // mode-check not available — default to skip (safe: don't run Heavy hooks in unknown mode)
  let d = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { d += c; });
  process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
  return;
}
// ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const HOMUNCULUS_DIR = path.join(os.homedir(), '.claude', 'homunculus');
const LOCK_FILE = path.join(HOMUNCULUS_DIR, '.promote-lock');
const LOG_FILE = path.join(HOMUNCULUS_DIR, 'promote-log.jsonl');

// Memory → CLAUDE.md promotion paths
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');
const TODAY_FILE = path.join(MEMORY_DIR, 'today.md');
const WEEKLY_FILE = path.join(MEMORY_DIR, 'weekly.md');
const LONG_TERM_FILE = path.join(MEMORY_DIR, 'long-term.md');
const CLAUDE_MD = path.join(PROJECT_ROOT, 'CLAUDE.md');
const PROMOTE_LOCK = path.join(PROJECT_ROOT, '.claude', '.memory-promote-lock');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AUTO_ENTRIES = 5; // Max entries per promotion cycle
const MIN_OCCURRENCES = 2;  // Minimum times a pattern must appear to be promoted
const INSERT_MARKER = '<!-- 新错误追加在此行下方 -->';

function getDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function shouldRunPromote() {
  try {
    if (fs.existsSync(PROMOTE_LOCK)) {
      const stat = fs.statSync(PROMOTE_LOCK);
      if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
        return false;
      }
    }
  } catch {}
  return true;
}

function touchLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, getDateString(), 'utf8');
}

function touchPromoteLock() {
  fs.mkdirSync(path.dirname(PROMOTE_LOCK), { recursive: true });
  fs.writeFileSync(PROMOTE_LOCK, getDateString(), 'utf8');
}

// ══════════════════════════════════════════════════════════════
// Part 2: Memory → CLAUDE.md auto-promotion
// ══════════════════════════════════════════════════════════════

/**
 * Extract decision/constraint/lesson entries from memory files.
 * Returns array of { text, source, count } objects.
 */
function extractMemoryEntries() {
  const entries = [];
  const files = [
    { path: TODAY_FILE, name: 'today' },
    { path: WEEKLY_FILE, name: 'weekly' },
    { path: LONG_TERM_FILE, name: 'long-term' },
  ];

  for (const file of files) {
    try {
      if (!fs.existsSync(file.path)) continue;
      const content = fs.readFileSync(file.path, 'utf8');

      // Extract lines that look like decisions or lessons
      // Format: "- 描述 → 做法" or "**Decisions:**" followed by "- ..."
      const lines = content.split('\n');
      let inDecisions = false;
      let inConstraints = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Track sections
        if (/\*\*Decisions:?\*\*/.test(trimmed)) { inDecisions = true; inConstraints = false; continue; }
        if (/\*\*Constraints:?\*\*/.test(trimmed)) { inConstraints = true; inDecisions = false; continue; }
        if (/\*\*Open loops:?\*\*/.test(trimmed)) { inDecisions = false; inConstraints = false; continue; }
        if (/^###?\s/.test(trimmed)) { inDecisions = false; inConstraints = false; continue; }

        // Extract entries with → pattern (explicit lesson format)
        if (trimmed.startsWith('- ') && trimmed.includes('→')) {
          const text = trimmed.replace(/^- /, '').trim();
          // Skip mode escalation noise (auto-升档)
          if (/自动升档/.test(text)) continue;
          entries.push({ text, source: file.name, type: 'lesson' });
          continue;
        }

        // Extract constraint entries (FIXME/HACK patterns)
        if (inConstraints && trimmed.startsWith('- ')) {
          const text = trimmed.replace(/^- /, '').trim();
          if (text.length > 10) {
            entries.push({ text, source: file.name, type: 'constraint' });
          }
        }
      }
    } catch {
      // File read failed — skip
    }
  }

  return entries;
}

/**
 * Count recurring patterns by normalizing and grouping similar entries.
 * Returns entries that appear >= MIN_OCCURRENCES times.
 */
function findRecurringPatterns(entries) {
  // Normalize: lowercase, strip dates/times, collapse whitespace
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}/g, '')
      .replace(/\d{2}:\d{2}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Group by normalized key
  const groups = {};
  for (const entry of entries) {
    const key = normalize(entry.text);
    if (!groups[key]) {
      groups[key] = { text: entry.text, count: 0, source: entry.source, type: entry.type };
    }
    groups[key].count++;
  }

  // Filter by minimum occurrences, sort by count descending
  return Object.values(groups)
    .filter(g => g.count >= MIN_OCCURRENCES)
    .sort((a, b) => b.count - a.count);
}

/**
 * Check if a lesson is already present in CLAUDE.md's 错误教训日志.
 */
function isAlreadyInClaudeMd(claudeMdContent, entryText) {
  // Normalize both for fuzzy matching
  const normalizedEntry = entryText.toLowerCase().replace(/\s+/g, ' ');
  const normalizedContent = claudeMdContent.toLowerCase().replace(/\s+/g, ' ');

  // Check for significant overlap (extract key phrases)
  const keywords = normalizedEntry
    .replace(/→.*$/, '') // Take the "problem" part before →
    .split(/[\s,，。.]+/)
    .filter(w => w.length > 2);

  if (keywords.length === 0) return true; // Can't match — skip

  // If 60%+ of keywords appear in existing content, consider it a duplicate
  const matchCount = keywords.filter(kw => normalizedContent.includes(kw)).length;
  return matchCount / keywords.length >= 0.6;
}

/**
 * Write promoted entries to CLAUDE.md's 错误教训日志 section.
 */
function promoteToClaudeMd() {
  if (!shouldRunPromote()) {
    console.error('[MemoryPromote] CLAUDE.md promotion throttled (ran today)');
    return 0;
  }

  if (!fs.existsSync(CLAUDE_MD)) {
    console.error('[MemoryPromote] CLAUDE.md not found, skipping promotion');
    return 0;
  }

  const claudeMdContent = fs.readFileSync(CLAUDE_MD, 'utf8');
  if (!claudeMdContent.includes(INSERT_MARKER)) {
    console.error('[MemoryPromote] Insert marker not found in CLAUDE.md, skipping');
    return 0;
  }

  // Extract and find recurring patterns
  const entries = extractMemoryEntries();
  if (entries.length === 0) {
    console.error('[MemoryPromote] No memory entries found');
    touchPromoteLock();
    return 0;
  }

  const recurring = findRecurringPatterns(entries);
  if (recurring.length === 0) {
    // Also check for explicit lesson entries (with →) even if they appear only once
    // These are already in lesson format and valuable enough to promote
    const lessons = entries.filter(e => e.type === 'lesson' && e.text.includes('→'));
    if (lessons.length === 0) {
      console.error('[MemoryPromote] No recurring patterns or lessons found');
      touchPromoteLock();
      return 0;
    }
    // Use single-occurrence lessons as candidates
    for (const l of lessons) {
      recurring.push({ text: l.text, count: 1, source: l.source, type: 'lesson' });
    }
  }

  // Filter out entries already in CLAUDE.md
  const newEntries = recurring
    .filter(e => !isAlreadyInClaudeMd(claudeMdContent, e.text))
    .slice(0, MAX_AUTO_ENTRIES);

  if (newEntries.length === 0) {
    console.error('[MemoryPromote] All candidates already in CLAUDE.md');
    touchPromoteLock();
    return 0;
  }

  // Build new lines to insert
  const today = getDateString();
  const newLines = newEntries.map(e => {
    // Ensure entry has → format
    const text = e.text.includes('→') ? e.text : `${e.text} → 需关注`;
    return `- [${today}] [auto] ${text}`;
  });

  // Insert after the marker
  const updatedContent = claudeMdContent.replace(
    INSERT_MARKER,
    INSERT_MARKER + '\n' + newLines.join('\n')
  );

  fs.writeFileSync(CLAUDE_MD, updatedContent, 'utf8');
  touchPromoteLock();

  console.error(`[MemoryPromote] Promoted ${newLines.length} entries to CLAUDE.md:`);
  newLines.forEach(l => console.error(`  ${l}`));

  return newLines.length;
}

// ══════════════════════════════════════════════════════════════
// Part 1: Instinct promotion (original logic)
// ══════════════════════════════════════════════════════════════

function findInstinctCli() {
  const projectCli = path.join(
    process.cwd(), '.claude', 'skills',
    'ecc-continuous-learning-v2', 'scripts', 'instinct-cli.py'
  );
  if (fs.existsSync(projectCli)) return projectCli;

  const globalCli = path.join(
    os.homedir(), '.claude', 'skills',
    'ecc-continuous-learning-v2', 'scripts', 'instinct-cli.py'
  );
  if (fs.existsSync(globalCli)) return globalCli;

  return null;
}

function findPython() {
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' });
      return cmd;
    } catch {}
  }
  return null;
}

const MAX_LOG_LINES = 100;

function appendLog(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');

  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LOG_LINES) {
      fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LOG_LINES).join('\n') + '\n', 'utf8');
    }
  } catch {}
}

function promoteInstincts() {
  if (!shouldRun()) return;

  const cliPath = findInstinctCli();
  if (!cliPath) { touchLock(); return; }

  const python = findPython();
  if (!python) { touchLock(); return; }

  let dryOutput;
  try {
    dryOutput = execFileSync(python, [cliPath, 'promote', '--dry-run', '--force'], {
      encoding: 'utf8', timeout: 10000, cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch { touchLock(); return; }

  const nothingToPromote = dryOutput.includes('No instincts') || dryOutput.includes('0 instincts');
  const hasPromotions = !nothingToPromote && (
    /would promote \d+/i.test(dryOutput) ||
    /\b[a-z0-9_-]+\s*→\s*(?:system|global)/i.test(dryOutput)
  );

  if (nothingToPromote || !hasPromotions) {
    appendLog({ timestamp: new Date().toISOString(), action: 'check', result: 'no_candidates', project: path.basename(process.cwd()) });
    touchLock();
    return;
  }

  let promoteOutput;
  try {
    promoteOutput = execFileSync(python, [cliPath, 'promote', '--force'], {
      encoding: 'utf8', timeout: 10000, cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    appendLog({ timestamp: new Date().toISOString(), action: 'promote', result: 'error', error: err.message, project: path.basename(process.cwd()) });
    touchLock();
    return;
  }

  appendLog({ timestamp: new Date().toISOString(), action: 'promote', result: 'success', output: promoteOutput.trim().substring(0, 500), project: path.basename(process.cwd()) });
  touchLock();
}

// ══════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════

function main() {
  // Part 1: Instinct promotion
  promoteInstincts();

  // Part 2: Memory → CLAUDE.md promotion
  try {
    promoteToClaudeMd();
  } catch (err) {
    console.error(`[MemoryPromote] CLAUDE.md promotion error: ${err.message}`);
  }
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
    console.error('[MemoryPromote] Error:', err.message);
  }
  // Pass through stdin for downstream hooks
  process.stdout.write(stdinData);
  process.exit(0);
});
