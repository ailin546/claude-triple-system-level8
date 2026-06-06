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
    // Join shell line-continuations first: `git \<newline>push` is one command.
    .replace(/\\\r?\n/g, ' ')
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
  if (typeof cmd !== 'string' || !cmd) return [];
  // Join line-continuations before anything else.
  const norm = cmd.replace(/\\\r?\n/g, ' ');
  // Command substitutions `$(...)` / backticks EXECUTE regardless of quoting,
  // so surface their inner command as its own segment — otherwise a real
  // command hidden in `--reason "$(terraform apply)"` is never seen.
  // (Single level only; nested `$( $() )` is not unwrapped — rare.)
  const subs = [...norm.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)]
    .map((m) => (m[1] !== undefined ? m[1] : m[2]).trim())
    .filter(Boolean);
  // Split on real command separators. `&` only separates when it is NOT part
  // of a redirection (`2>&1`, `>&2`, `&>file`) — an `&` adjacent to a digit or
  // `>` is a redirect, not a background/chain operator.
  const base = stripQuotedStrings(norm)
    // Blank substitution spans in the base too — their content is surfaced as
    // separate `subs` segments; leaving the raw `$(...)`/`` `...` `` syntax in
    // base would double-count and mis-tokenize.
    .replace(/\$\([^()]*\)|`[^`]*`/g, ' ')
    .split(/\s*(?:&&|\|\||;|\n|\||(?<![>\d])&(?![>\d]))\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return base.concat(subs);
}

/**
 * Return the git subcommand at the HEAD of a single segment, or null.
 *
 * Only matches when `git` is the command actually being run — optionally
 * preceded by env-assignments (`GIT_SSH_COMMAND= git push`) or benign
 * wrappers (`sudo`/`time`/`command`/`nice`/`env`). It deliberately does NOT
 * match `git` appearing as an argument: `echo git push` → null.
 *
 * Git global options before the subcommand are skipped, so `git --no-pager
 * push` and `git -c user.x=y commit` are correctly seen as push/commit
 * (closing an evaluation-gate bypass). Value-taking globals (`-c`, `-C`,
 * `--git-dir`, `--work-tree`, `--namespace`, `--exec-path`, `--super-prefix`)
 * consume their argument; `=`-form and boolean globals are skipped too.
 *
 * @param {string} segment one command segment (already quote-stripped)
 * @returns {string|null} e.g. 'commit', 'push', 'status', or null
 */
function gitSubcommand(segment) {
  if (typeof segment !== 'string') return null;
  const m = segment.trim().match(
    /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|sudo|time|command|nice|env)\s+)*git\s+(?:(?:-c|-C|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix)\s+\S+\s+|--[A-Za-z][A-Za-z-]*=\S+\s+|-{1,2}[A-Za-z][A-Za-z-]*\s+)*([a-z][a-z-]*)/
  );
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
