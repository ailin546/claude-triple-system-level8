#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when a new Claude session starts. Loads a structured summary
 * of the most recent session into Claude's context via stdout.
 *
 * All dependencies are inlined — no external lib/ required.
 */

const path = require('path');
const fs = require('fs');

// ── Inlined utilities (previously from ../lib/) ──────────────

const SESSIONS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.claude', 'sessions'
);
const LEARNED_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.claude', 'learned-skills'
);

const MAX_SUMMARY_BYTES = 2048; // Cap injected context at ~2KB

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(msg) {
  console.error(msg); // stderr — invisible to Claude context
}

function output(msg) {
  process.stdout.write(msg + '\n'); // stdout — injected into context
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Find files matching a glob-like suffix, sorted newest-first.
 * @param {string} dir   Directory to search
 * @param {string} suffix  e.g. '-session.tmp'
 * @param {{ maxAge?: number }} opts  maxAge in days
 */
function findFiles(dir, suffix, opts = {}) {
  if (!fs.existsSync(dir)) return [];
  const cutoff = opts.maxAge
    ? Date.now() - opts.maxAge * 86400000
    : 0;

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(suffix.replace('*', '')))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs };
    })
    .filter(f => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Detect project type by checking common config files.
 */
function detectProjectType() {
  const cwd = process.cwd();
  const languages = [];
  const frameworks = [];

  const checks = [
    { file: 'package.json', lang: 'JavaScript/TypeScript', fw: null },
    { file: 'tsconfig.json', lang: null, fw: 'TypeScript' },
    { file: 'next.config.js', lang: null, fw: 'Next.js' },
    { file: 'next.config.mjs', lang: null, fw: 'Next.js' },
    { file: 'vite.config.ts', lang: null, fw: 'Vite' },
    { file: 'angular.json', lang: null, fw: 'Angular' },
    { file: 'requirements.txt', lang: 'Python', fw: null },
    { file: 'pyproject.toml', lang: 'Python', fw: null },
    { file: 'Cargo.toml', lang: 'Rust', fw: null },
    { file: 'go.mod', lang: 'Go', fw: null },
    { file: 'build.gradle', lang: 'Java/Kotlin', fw: 'Gradle' },
    { file: 'pom.xml', lang: 'Java', fw: 'Maven' },
    { file: 'Gemfile', lang: 'Ruby', fw: null },
    { file: 'mix.exs', lang: 'Elixir', fw: null },
  ];

  for (const c of checks) {
    if (fs.existsSync(path.join(cwd, c.file))) {
      if (c.lang && !languages.includes(c.lang)) languages.push(c.lang);
      if (c.fw && !frameworks.includes(c.fw)) frameworks.push(c.fw);
    }
  }
  return { languages, frameworks };
}

/**
 * Detect package manager from lockfiles.
 */
function getPackageManager() {
  const cwd = process.cwd();
  const lockFiles = [
    { file: 'pnpm-lock.yaml', name: 'pnpm' },
    { file: 'yarn.lock', name: 'yarn' },
    { file: 'bun.lockb', name: 'bun' },
    { file: 'package-lock.json', name: 'npm' },
  ];
  for (const lf of lockFiles) {
    if (fs.existsSync(path.join(cwd, lf.file))) {
      return { name: lf.name, source: 'lockfile' };
    }
  }
  return { name: 'npm', source: 'default' };
}

// ── Structured summary extraction ────────────────────────────

/**
 * Extract a structured summary from a session file instead of
 * injecting the entire file content. Caps output at MAX_SUMMARY_BYTES.
 */
function buildStructuredSummary(rawContent) {
  const lines = rawContent.split('\n');
  const summary = {
    goal: null,
    openTasks: [],
    filesModified: [],
    decisions: [],
    resumeHint: null,
  };

  // Extract goal from headings before iterating (headings are consumed by section detection)
  const sessionHeadingMatch = rawContent.match(/^#\s+Session:\s+(.+)$/m);
  if (sessionHeadingMatch) {
    summary.goal = sessionHeadingMatch[1].trim();
  }

  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect sections
    if (/^#{1,3}\s+Tasks?/i.test(trimmed)) { currentSection = 'tasks'; continue; }
    if (/^#{1,3}\s+Files?\s+Modified/i.test(trimmed)) { currentSection = 'files'; continue; }
    if (/^#{1,3}\s+Notes?\s+for\s+Next/i.test(trimmed)) { currentSection = 'notes'; continue; }
    if (/^#{1,3}\s+Completed/i.test(trimmed)) { currentSection = 'completed'; continue; }
    if (/^#{1,3}\s+In\s+Progress/i.test(trimmed)) { currentSection = 'inprogress'; continue; }
    if (/^#{1,3}\s+/i.test(trimmed)) { currentSection = 'other'; continue; }

    if (!trimmed || trimmed.startsWith('<!--')) continue;

    // Extract bullet items per section
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (!bulletMatch) continue;
    const item = bulletMatch[1];

    switch (currentSection) {
      case 'tasks':
      case 'inprogress':
        if (item !== '[ ]') summary.openTasks.push(item);
        break;
      case 'files':
        summary.filesModified.push(item);
        break;
      case 'notes':
        if (item !== '-') summary.decisions.push(item);
        break;
    }
  }

  // Also try to extract goal from **Project:** header
  const projectMatch = rawContent.match(/\*\*Project:\*\*\s*(.+)/);
  if (projectMatch && !summary.goal) {
    summary.goal = projectMatch[1].trim();
  }

  // Build compact output
  const parts = ['## Session Resume'];
  if (summary.goal) parts.push(`- **Project:** ${summary.goal}`);
  if (summary.openTasks.length > 0) {
    parts.push(`- **Open tasks:** ${summary.openTasks.length}`);
    for (const t of summary.openTasks.slice(0, 5)) {
      parts.push(`  - ${t.slice(0, 120)}`);
    }
  }
  if (summary.filesModified.length > 0) {
    parts.push(`- **Files touched:** ${summary.filesModified.slice(0, 10).join(', ')}`);
  }
  if (summary.decisions.length > 0) {
    parts.push(`- **Notes:** ${summary.decisions.slice(0, 3).join('; ')}`);
  }

  let result = parts.join('\n');
  if (Buffer.byteLength(result, 'utf8') > MAX_SUMMARY_BYTES) {
    const buf = Buffer.from(result, 'utf8');
    let end = MAX_SUMMARY_BYTES - 3;
    // Walk back to avoid splitting a multi-byte UTF-8 sequence
    while (end > 0 && (buf[end] & 0xC0) === 0x80) end--;
    result = buf.subarray(0, end).toString('utf8') + '...';
  }
  return result;
}

// ── Shared Memory ────────────────────────────────────────────

const MEMORY_DIR = path.join(process.cwd(), '.memory');
const GLOBAL_MEMORY_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.memory'
);
const MAX_MEMORY_BYTES = 1024; // Cap each memory file excerpt

/**
 * Read global memory (~/.memory/) and inject into context.
 * Reads: long-term.md → today.md (no weekly at global level).
 * Non-blocking: missing dir/files are silently skipped.
 */
function loadGlobalMemory() {
  if (!fs.existsSync(GLOBAL_MEMORY_DIR)) {
    log('[SessionStart] ~/.memory/ not found, skipping global memory');
    return;
  }

  const memoryFiles = [
    { name: 'long-term.md', label: 'Global long-term' },
    { name: 'today.md', label: 'Global today' },
  ];

  const parts = [];
  for (const { name, label } of memoryFiles) {
    const filePath = path.join(GLOBAL_MEMORY_DIR, name);
    const content = readFile(filePath);
    if (!content || !content.trim()) continue;

    const lines = content.split('\n');
    const bodyLines = lines.filter(l => !l.startsWith('# ') && !l.startsWith('> '));
    const body = bodyLines.join('\n').trim();
    if (!body || body === '## Sessions') continue;

    let excerpt = body;
    if (Buffer.byteLength(excerpt, 'utf8') > MAX_MEMORY_BYTES) {
      const buf = Buffer.from(excerpt, 'utf8');
      let end = MAX_MEMORY_BYTES - 3;
      while (end > 0 && (buf[end] & 0xC0) === 0x80) end--;
      excerpt = buf.subarray(0, end).toString('utf8') + '...';
    }

    parts.push(`**${label}:**\n${excerpt}`);
  }

  if (parts.length > 0) {
    output(`## Global Memory\n${parts.join('\n\n')}`);
    log(`[SessionStart] Loaded ${parts.length} global memory file(s)`);
  }
}

/**
 * Read shared memory files and inject a compact summary.
 * Reads: long-term.md → weekly.md → today.md (per RULES.md protocol).
 * Non-blocking: missing files are silently skipped.
 */
function loadSharedMemory() {
  if (!fs.existsSync(MEMORY_DIR)) {
    log('[SessionStart] warn: .memory/ directory not found, skipping shared memory');
    return;
  }

  const memoryFiles = [
    { name: 'long-term.md', label: 'Long-term knowledge' },
    { name: 'weekly.md', label: 'Weekly summary' },
    { name: 'today.md', label: 'Today log' },
  ];

  const parts = [];
  let loadedCount = 0;

  for (const { name, label } of memoryFiles) {
    const filePath = path.join(MEMORY_DIR, name);
    const content = readFile(filePath);
    if (!content || !content.trim()) continue;

    // Strip the first heading line and any empty "template-only" content
    const lines = content.split('\n');
    const bodyLines = lines.filter(l => !l.startsWith('# ') && !l.startsWith('> '));
    const body = bodyLines.join('\n').trim();
    if (!body || body === '## Sessions') continue;

    // Truncate to keep context injection small
    let excerpt = body;
    if (Buffer.byteLength(excerpt, 'utf8') > MAX_MEMORY_BYTES) {
      const buf = Buffer.from(excerpt, 'utf8');
      let end = MAX_MEMORY_BYTES - 3;
      while (end > 0 && (buf[end] & 0xC0) === 0x80) end--;
      excerpt = buf.subarray(0, end).toString('utf8') + '...';
    }

    parts.push(`**${label}:**\n${excerpt}`);
    loadedCount++;
  }

  if (parts.length > 0) {
    output(`## Shared Memory\n${parts.join('\n\n')}`);
    log(`[SessionStart] Loaded ${loadedCount} shared memory file(s)`);
  } else {
    log('[SessionStart] Shared memory files exist but contain no actionable content');
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  ensureDir(SESSIONS_DIR);
  ensureDir(LEARNED_DIR);

  // Pull shared memory from remote (if configured)
  try {
    const memorySync = require('../lib/memory-sync');
    if (memorySync.isEnabled()) {
      memorySync.pull();
      log('[SessionStart] Memory sync: pulled from remote');
    }
  } catch (err) {
    log(`[SessionStart] Memory sync pull skipped: ${err.message}`);
  }

  // Load global memory (~/.memory/) first
  loadGlobalMemory();

  // Load project-local shared memory (long-term → weekly → today)
  loadSharedMemory();

  // Load most recent session — inject structured summary, not full text
  const recentSessions = findFiles(SESSIONS_DIR, '-session.tmp', { maxAge: 7 });

  if (recentSessions.length > 0) {
    const latest = recentSessions[0];
    log(`[SessionStart] Found ${recentSessions.length} recent session(s)`);
    log(`[SessionStart] Latest: ${latest.path}`);

    const content = readFile(latest.path);
    if (content && !content.includes('[Session context goes here]')) {
      const structured = buildStructuredSummary(content);
      output(structured);
    }
  }

  // Report learned skills
  const learnedSkills = findFiles(LEARNED_DIR, '.md');
  if (learnedSkills.length > 0) {
    log(`[SessionStart] ${learnedSkills.length} learned skill(s) available in ${LEARNED_DIR}`);
  }

  // Dynamic rules loading — only load rules for detected languages
  try {
    require('./rules-loader.js');
    log('[SessionStart] Dynamic rules loading completed');
  } catch (err) {
    log(`[SessionStart] Rules loader error: ${err.message}`);
  }

  // Detect and report package manager
  const pm = getPackageManager();
  log(`[SessionStart] Package manager: ${pm.name} (${pm.source})`);

  // Output host identifier for multi-machine collaboration
  const hostname = require('os').hostname();
  output(`Host: ${hostname}`);
  log(`[SessionStart] Host: ${hostname}`);

  // Detect project type
  const projectInfo = detectProjectType();
  if (projectInfo.languages.length > 0 || projectInfo.frameworks.length > 0) {
    const parts = [];
    if (projectInfo.languages.length > 0) parts.push(`languages: ${projectInfo.languages.join(', ')}`);
    if (projectInfo.frameworks.length > 0) parts.push(`frameworks: ${projectInfo.frameworks.join(', ')}`);
    log(`[SessionStart] Project detected — ${parts.join('; ')}`);
    output(`Project type: ${JSON.stringify(projectInfo)}`);
  } else {
    log('[SessionStart] No specific project type detected');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[SessionStart] Error:', err.message);
  process.exit(0); // Don't block on errors
});
