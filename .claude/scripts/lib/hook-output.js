#!/usr/bin/env node
/**
 * Shared helper: emit additionalContext from a hook so the text reaches
 * Claude's model context (exit 0, non-blocking).
 *
 * Why this exists (empirically verified 2026-06-27, /Users/llm/project):
 *   For PostToolUse / PreToolUse hooks, plain stdout AND stderr on exit 0 are
 *   NOT shown to the model — they only land in the transcript / terminal.
 *   The only non-blocking way to inject text into context from these events is
 *   this JSON form on stdout. (exit 2 + stderr also reaches the model, but it
 *   marks the tool as a blocking error — too heavy for a gentle nudge.)
 *
 *   Probe results:
 *     PostToolUse exit 0 stdout (plain) ......... model does NOT see
 *     PostToolUse exit 0 stderr ................. model does NOT see
 *     PostToolUse exit 2 stderr ................. model sees (blocking error)
 *     PostToolUse exit 0 hookSpecificOutput JSON  model sees (non-blocking) ← this
 *
 * CONTRACT: a hook that calls this MUST NOT also write anything else to stdout
 * (no stdin passthrough), or the combined stdout is invalid JSON and the
 * additionalContext is silently dropped.
 */

'use strict';

/**
 * Write a hookSpecificOutput JSON envelope to stdout.
 * @param {string} text          the context to inject (visible to the model)
 * @param {string} hookEventName defaults to 'PostToolUse'
 */
function emitAdditionalContext(text, hookEventName = 'PostToolUse') {
  if (!text) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName,
      additionalContext: String(text),
    },
  }));
}

module.exports = { emitAdditionalContext };
