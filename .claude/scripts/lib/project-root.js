#!/usr/bin/env node
/**
 * Safe project root resolver for hooks.
 *
 * Two nesting traps this guards against:
 *
 * 1. ~/.claude/ self-edit nesting
 *    When Claude operates on its own config directory (cwd inside ~/.claude/,
 *    e.g. editing rules-all/, skills/, commands/), the naive
 *    `path.join(PROJECT_ROOT, '.claude', ...)` pattern creates nested
 *    ~/.claude/<subdir>/.claude/ directories. Fix: collapse cwd-in-~/.claude
 *    back to HOME, so hook state stays at the canonical ~/.claude/.
 *
 * 2. .memory/ git-repo nesting (2026-05-03)
 *    The .memory/ directory is itself an independent git repo (see
 *    lib/memory-sync.js for design). When cwd lands inside it,
 *    `git rev-parse --show-toplevel` returns .memory/ as the project root.
 *    Hooks then write `.memory/.memory/today.md` (observed up to 3 levels
 *    deep), and also pollute .memory/ with runtime state files
 *    (.task-mode, .escalation-state.json) that memory-sync auto-commits.
 *    Fix: when cwd / git-toplevel lands inside any `.memory` dir, walk up
 *    to the first non-`.memory` ancestor — the *real* project root.
 *
 * Usage:
 *   const { getProjectRoot } = require('../lib/project-root');
 *   const PROJECT_ROOT = getProjectRoot();
 */

'use strict';

const path = require('path');
const os = require('os');

const HOME_CLAUDE_DIR = path.join(os.homedir(), '.claude');

/**
 * Get the project root, guarding against cwd being inside ~/.claude.
 *
 * Priority:
 * 1. process.env.CLAUDE_PROJECT_ROOT (if set and not inside ~/.claude)
 * 2. process.cwd() (if not inside ~/.claude)
 * 3. HOME (parent of ~/.claude) when cwd IS inside ~/.claude
 *
 * Rationale: hooks typically build state paths as
 *     path.join(PROJECT_ROOT, '.claude', 'whatever')
 * If PROJECT_ROOT were ~/.claude itself, the result would be
 *     ~/.claude/.claude/whatever        ← nested, wrong
 * Returning HOME (~) instead gives
 *     ~/.claude/whatever                ← canonical, correct
 * which collapses hook state into the canonical ~/.claude/ location
 * whenever Claude operates on its own config directory.
 *
 * @returns {string} absolute path to project root
 */
function getProjectRoot() {
  const raw = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  if (isInsideHomeClaude(raw)) {
    return path.dirname(HOME_CLAUDE_DIR);
  }
  if (isInsideMemoryRepo(raw)) {
    return escapeMemoryRepo(raw);
  }
  return raw;
}

/**
 * Check whether a path is ~/.claude itself or any of its descendants.
 * @param {string} p absolute path
 * @returns {boolean}
 */
function isInsideHomeClaude(p) {
  if (!p) return false;
  return p === HOME_CLAUDE_DIR || p.startsWith(HOME_CLAUDE_DIR + path.sep);
}

/**
 * Check whether a path *is* a `.memory` directory or sits inside one.
 * Matches both `/home/u/proj/.memory` and `/home/u/proj/.memory/sub/dir`.
 * @param {string} p absolute path
 * @returns {boolean}
 */
function isInsideMemoryRepo(p) {
  if (!p) return false;
  const norm = path.resolve(p);
  if (path.basename(norm) === '.memory') return true;
  return norm.includes(path.sep + '.memory' + path.sep);
}

/**
 * Walk up from a path until landing on the first ancestor that is neither
 * a `.memory` directory itself nor inside one. Used to recover the real
 * project root when cwd / git-toplevel falls inside `.memory/`.
 *
 * Example:
 *   /home/u/proj/.memory/.memory  →  /home/u/proj
 *   /home/u/proj/sub/.memory      →  /home/u/proj/sub
 *
 * Stops at filesystem root; returns that as a last resort.
 *
 * @param {string} p absolute path inside a .memory tree
 * @returns {string} ancestor path that is not in any .memory tree
 */
function escapeMemoryRepo(p) {
  let cur = path.resolve(p);
  while (cur !== path.dirname(cur)) {
    if (!isInsideMemoryRepo(cur)) return cur;
    cur = path.dirname(cur);
  }
  return cur;
}

module.exports = {
  getProjectRoot,
  isInsideHomeClaude,
  isInsideMemoryRepo,
  escapeMemoryRepo,
  HOME_CLAUDE_DIR,
};
