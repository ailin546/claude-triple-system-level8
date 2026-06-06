#!/usr/bin/env node
'use strict';
/**
 * command-scan.js — shared shell-command parsing helpers for guard hooks.
 *
 * Root cause this addresses (2026-06-06): pre-tool-escalate.js and
 * evaluation-gate.js both matched their patterns against the RAW command
 * string. That conflated three distinct things into one blob:
 *   1. the actual command(s) being run,
 *   2. flag/argument VALUES (`--reason "..."`, `-m "..."`, path args),
 *   3. chained sub-commands (`a && b ; c`).
 * The result was a self-reinforcing deadlock with evaluation-gate: any
 * `git push` auto-escalated to heavy, and the de-escalation CLI's own
 * `--reason "...git push..."` text matched the gate's `git push` pattern —
 * so the command meant to LOWER the mode re-tripped the guard that blocked it.
 *
 * These helpers let a hook reason about command STRUCTURE instead of raw
 * substrings. They are pure functions with no I/O or side effects, but are
 * unit-tested anyway (`__tests__/command-scan.test.js`) because they underpin
 * two blocking hooks (evaluation-gate exit 2, pre-tool-escalate mode change).
 *
 * See: error-log [2026-06-06], ~/.claude/scripts/hooks/{pre-tool-escalate,
 * evaluation-gate}.js, and CLAUDE.md §Long-term correctness 守卫.
 */

/**
 * Replace the CONTENTS of quoted spans with nothing, preserving surrounding
 * command structure (operators, command names). Handles double and single
 * quotes with backslash escapes. A dangling unbalanced opening quote blanks
 * everything to the end of its line, so `--reason "git push` (no closer)
 * cannot leak the tail.
 *
 * @param {string} cmd raw shell command
 * @returns {string} command with quoted values removed
 */
function stripQuotedStrings(cmd) {
  if (typeof cmd !== 'string' || !cmd) return '';
  const out = cmd
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    // Any quote char left is a dangling opener — blank to end of its line.
    .replace(/["'][^\n]*/g, '');
  return out;
}

/**
 * Split a command into its constituent simple commands. Quotes are stripped
 * FIRST, so chain/sequence operators that appear inside string literals do
 * not split the command. Splits on `;`, `&&`, `||`, `|`, `&`, and newlines
 * (runs of these collapse, so `a && b` yields two segments, not three).
 *
 * @param {string} cmd raw shell command
 * @returns {string[]} trimmed, non-empty command segments (quotes removed)
 */
function splitSegments(cmd) {
  return stripQuotedStrings(cmd)
    .split(/[\n;&|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Return the git subcommand at the HEAD of a single segment, or null.
 *
 * Only matches when `git` is the command actually being run — optionally
 * preceded by env-assignments (`GIT_SSH_COMMAND= git push`) or benign
 * wrappers (`sudo`/`time`/`command`/`nice`/`env`). It deliberately does NOT
 * match `git` appearing as an argument: `echo git push` → null.
 *
 * Rare forms with global flags before the subcommand (`git -c x=y commit`,
 * `git --no-pager push`) return null (fail-open) — acceptable because the
 * only consumers treat null as "not a commit/push" and their downstream
 * behavior already fails open on uncertainty.
 *
 * @param {string} segment one command segment (already quote-stripped)
 * @returns {string|null} e.g. 'commit', 'push', 'status', or null
 */
function gitSubcommand(segment) {
  if (typeof segment !== 'string') return null;
  const m = segment
    .trim()
    .match(/^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|sudo|time|command|nice|env)\s+)*git\s+([a-z][a-z-]*)/);
  return m ? m[1] : null;
}

/**
 * True if a segment invokes the set-mode.js CLI — the de-escalation tool.
 * Such a segment must never be treated as a risk signal, or resetting the
 * mode re-escalates it (the [2026-05-20] deadlock). Matches the script name
 * only when it is a real path/word boundary, so `foo-set-mode.js` is excluded.
 *
 * @param {string} segment one command segment
 * @returns {boolean}
 */
function isSetModeInvocation(segment) {
  if (typeof segment !== 'string') return false;
  return /(?:^|[\s/])set-mode\.js(?:\s|$)/.test(segment);
}

module.exports = {
  stripQuotedStrings,
  splitSegments,
  gitSubcommand,
  isSetModeInvocation,
};
