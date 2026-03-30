#!/usr/bin/env node
/**
 * Shared utility functions for ECC hook scripts.
 *
 * All functions are synchronous unless noted, and fail gracefully
 * (return null/empty) rather than throwing, to keep hooks non-blocking.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ── Path helpers ──────────────────────────────────────────────

/**
 * Return the project root via CLAUDE_PROJECT_ROOT or git.
 * Falls back to process.cwd().
 */
function getProjectRoot() {
  if (process.env.CLAUDE_PROJECT_ROOT) return process.env.CLAUDE_PROJECT_ROOT;
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

/** ~/.claude directory */
function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

/** ~/.memory directory (global cross-project memory) */
function getGlobalMemoryDir() {
  return path.join(os.homedir(), '.memory');
}

/** Project-local .claude/sessions directory */
function getSessionsDir() {
  return path.join(getProjectRoot(), '.claude', 'sessions');
}

/** ~/.claude/learned-skills directory */
function getLearnedSkillsDir() {
  return path.join(getClaudeDir(), 'learned-skills');
}

/** OS temp directory */
function getTempDir() {
  return os.tmpdir();
}

// ── File operations ───────────────────────────────────────────

/** Create directory recursively. Returns true on success. */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Read a file as UTF-8. Returns null on failure. */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Write content to a file (overwrite). Returns true on success. */
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Append content to a file. Returns true on success. */
function appendFile(filePath, content) {
  try {
    fs.appendFileSync(filePath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Find files in `dir` matching a glob-like `pattern`.
 * Simple implementation: only supports `*` wildcards.
 * Returns array of { path, name } objects.
 */
function findFiles(dir, pattern) {
  try {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
    );
    const entries = fs.readdirSync(dir);
    return entries
      .filter(name => regex.test(name))
      .map(name => ({ path: path.join(dir, name), name }));
  } catch {
    return [];
  }
}

/**
 * Count regex matches in a file.
 * @param {string} filePath
 * @param {RegExp} regex - must have the `g` flag
 * @returns {number}
 */
function countInFile(filePath, regex) {
  const content = readFile(filePath);
  if (!content) return 0;
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

// ── Git helpers ───────────────────────────────────────────────

/** Check if cwd is inside a git repository. */
function isGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of git-modified files (staged + unstaged + untracked).
 * @param {string[]} [extPatterns] - regex strings to filter by extension, e.g. ['\\.tsx?$']
 * @returns {string[]} absolute file paths
 */
function getGitModifiedFiles(extPatterns) {
  try {
    const root = getProjectRoot();
    const raw = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    let files = raw ? raw.split('\n').map(f => path.resolve(root, f)) : [];

    if (extPatterns && extPatterns.length > 0) {
      const regexes = extPatterns.map(p => new RegExp(p));
      files = files.filter(f => regexes.some(r => r.test(f)));
    }
    return files;
  } catch {
    return [];
  }
}

// ── Date/time helpers ─────────────────────────────────────────

/** ISO-like datetime string: YYYY-MM-DD HH:MM:SS */
function getDateTimeString() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

/** Time-only string: HH:MM:SS */
function getTimeString() {
  return new Date().toTimeString().split(' ')[0];
}

// ── Logging ───────────────────────────────────────────────────

/** Log a message to stderr (visible in Claude Code hook output). */
function log(msg) {
  process.stderr.write(`${msg}\n`);
}

// ── Exports ───────────────────────────────────────────────────

module.exports = {
  getProjectRoot,
  getClaudeDir,
  getGlobalMemoryDir,
  getSessionsDir,
  getLearnedSkillsDir,
  getTempDir,
  ensureDir,
  readFile,
  writeFile,
  appendFile,
  findFiles,
  countInFile,
  isGitRepo,
  getGitModifiedFiles,
  getDateTimeString,
  getTimeString,
  log,
};
