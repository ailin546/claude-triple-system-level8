#!/usr/bin/env node
/**
 * Shell command segmentation.
 *
 * Splits a shell command string into independent segments separated by
 * operators like &&, ||, ;, |, and newlines. Respects quoting so that
 * operators inside strings are not treated as separators.
 *
 */

'use strict';

/**
 * Split a shell command into segments separated by shell operators.
 *
 * Handles:
 * - Single quotes (no escape inside)
 * - Double quotes (backslash escape)
 * - Operators: &&, ||, ;, |, \n
 * - Parentheses/subshells are not split (treated as opaque)
 *
 * @param {string} input - Shell command string
 * @returns {string[]} Array of command segments (trimmed, non-empty)
 */
function splitShellSegments(input) {
  if (!input || typeof input !== 'string') return [];

  const segments = [];
  let current = '';
  let i = 0;
  let quote = null;

  while (i < input.length) {
    const ch = input[i];

    // Inside a quoted string
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
      }
      i += 1;
      continue;
    }

    // Start of quote
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }

    // Backslash escape outside quotes
    if (ch === '\\' && i + 1 < input.length) {
      current += ch + input[i + 1];
      i += 2;
      continue;
    }

    // Two-character operators: && and ||
    if (i + 1 < input.length) {
      const two = ch + input[i + 1];
      if (two === '&&' || two === '||') {
        const trimmed = current.trim();
        if (trimmed) segments.push(trimmed);
        current = '';
        i += 2;
        continue;
      }
    }

    // Single-character operators: ; | \n
    if (ch === ';' || ch === '|' || ch === '\n') {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const trimmed = current.trim();
  if (trimmed) segments.push(trimmed);

  return segments;
}

module.exports = {
  splitShellSegments,
};
