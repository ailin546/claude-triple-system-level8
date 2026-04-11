#!/usr/bin/env node
/**
 * Safe project root resolver for hooks.
 *
 * Problem: hooks commonly compute their state directory as
 *   path.join(PROJECT_ROOT, '.claude', ...)
 * where PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd().
 *
 * When Claude operates on its own config directory (cwd falls inside
 * ~/.claude/, e.g. editing rules-all/, skills/, commands/), this pattern
 * creates nested ~/.claude/<subdir>/.claude/ directories littered with
 * .escalation-state.json, .promote-lock, .task-mode, etc.
 *
 * Fix: detect when cwd is inside ~/.claude and collapse to ~/.claude itself,
 * so hook state files always live at ~/.claude/.task-mode (the canonical
 * "global project root" for Claude's own config).
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

module.exports = { getProjectRoot, isInsideHomeClaude, HOME_CLAUDE_DIR };
