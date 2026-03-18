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
const { execSync } = require('child_process');

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

    // Extract first heading as goal
    if (!summary.goal && /^#\s+Session:\s+/.test(trimmed)) {
      summary.goal = trimmed.replace(/^#\s+Session:\s+/, '').trim();
      continue;
    }

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
    result = result.slice(0, MAX_SUMMARY_BYTES - 3) + '...';
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  ensureDir(SESSIONS_DIR);
  ensureDir(LEARNED_DIR);

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

  // Detect and report package manager
  const pm = getPackageManager();
  log(`[SessionStart] Package manager: ${pm.name} (${pm.source})`);

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
