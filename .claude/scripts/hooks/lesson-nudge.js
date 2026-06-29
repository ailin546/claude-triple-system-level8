#!/usr/bin/env node
/**
 * PostToolUse(Bash) hook: after a lesson-worthy commit (fix/perf/refactor/
 * revert), if this session's transcript contains NO Lessons section at all,
 * nudge Claude to write one — once per session.
 *
 * Why this exists:
 *   The memory pipeline only sediments knowledge from a bolded Lessons
 *   section in conversation (stop-summary extracts it → today.md → weekly →
 *   long-term). workflow.md *requires* writing them, but a whole month of
 *   high-intensity fixes (M-92..M-125) produced ZERO lessons: the root
 *   causes went into commit bodies + KNOWN_ISSUES instead, bypassing the
 *   extract→sediment chain. Result: project long-term stopped growing
 *   2026-04-27 despite heavy activity.
 *
 *   fix-depth-check already proves the pattern — a hook nudge at commit time
 *   makes a behavior reliable where a passive rule was 0% followed. This is
 *   the same nudge, aimed at the Lessons section instead of commit-body WHY.
 *
 * Non-blocking (exit 0). The nudge is injected via hookSpecificOutput
 * additionalContext (the ONLY non-blocking channel the model actually sees from
 * PostToolUse — plain stdout/stderr on exit 0 are invisible to the model, see
 * lib/hook-output.js). Claude then writes a Lessons section in the next reply →
 * stop-summary extracts it → long-term resumes growing.
 *
 * Throttle: once per transcript (state in lesson-nudge.json). Also stays
 * silent if the session already wrote any Lessons section (culture present).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { emitAdditionalContext } = require('../lib/hook-output');

// Commit types worth a reusable lesson. feat/docs/chore are usually not.
const LESSON_WORTHY = /\b(fix(?:es|ed|ing)?|hotfix|bugfix|patch|perf|refactor|revert)\b/i;
const LESSON_WORTHY_CN = /(修复|修了|重构|回滚|优化)/;

const STATE_DIR = path.join(process.env.HOME || '/home/ubuntu', '.claude', '.session-state');
const STATE_FILE = path.join(STATE_DIR, 'lesson-nudge.json');

// Reuse fix-depth-check's commit-message parser (SSOT). Inline fallback keeps
// the hook working if that module ever moves.
let extractCommitMessage;
try {
  ({ extractCommitMessage } = require('./fix-depth-check.js'));
} catch {
  extractCommitMessage = function (cmd) {
    const dashM = cmd.match(/git\s+commit\b[^]*?-m\s+(['"])([^]*?)\1/);
    if (dashM) return dashM[2];
    const heredoc = cmd.match(/<<\s*'?EOF'?\s*\n([^]*?)\nEOF/);
    if (heredoc) return heredoc[1];
    return null;
  };
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * Does the transcript already contain a Lessons section header?
 *
 * Matches only line-start headers (the JSONL text escapes real newlines as
 * the two characters backslash-n, so a header is "\n**Lessons:**"). This
 * nudge's own stderr text deliberately never writes that exact line-start
 * form, so the nudge can't self-satisfy the check.
 */
function transcriptHasLessons(transcriptPath) {
  try {
    const stat = fs.statSync(transcriptPath);
    const MAX = 10 * 1024 * 1024;
    let raw;
    if (stat.size > MAX) {
      const fd = fs.openSync(transcriptPath, 'r');
      const buf = Buffer.alloc(MAX);
      fs.readSync(fd, buf, 0, MAX, stat.size - MAX);
      fs.closeSync(fd);
      raw = buf.toString('utf8');
    } else {
      raw = fs.readFileSync(transcriptPath, 'utf8');
    }
    return /\\n\s*\*\*Lessons:?\*\*/.test(raw);
  } catch { return false; }
}

function alreadyNudged(transcriptPath) {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const d = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return d.transcript === transcriptPath;
    }
  } catch { /* ignore */ }
  return false;
}

function markNudged(transcriptPath) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ transcript: transcriptPath, ts: Date.now() }), 'utf8');
  } catch { /* ignore */ }
}

function main() {
  // No stdin passthrough: stdout is reserved for the additionalContext JSON
  // envelope (any extra bytes make it invalid JSON → nudge silently dropped).
  const raw = readStdin();
  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  if (!parsed || parsed.tool_name !== 'Bash') process.exit(0);
  const cmd = (parsed.tool_input && parsed.tool_input.command) || '';
  if (!cmd.includes('git commit')) process.exit(0);

  const msg = extractCommitMessage(cmd);
  if (!msg) process.exit(0);
  if (!(LESSON_WORTHY.test(msg) || LESSON_WORTHY_CN.test(msg))) process.exit(0);

  const transcriptPath = parsed.transcript_path || process.env.CLAUDE_TRANSCRIPT_PATH;
  if (!transcriptPath) process.exit(0);

  // Session already writes lessons → pipeline is fed, stay silent.
  if (transcriptHasLessons(transcriptPath)) process.exit(0);
  // Throttle: one nudge per transcript.
  if (alreadyNudged(transcriptPath)) process.exit(0);

  // Injected via additionalContext (visible to Claude). The wording deliberately
  // never writes a line-start bold-Lessons header, so this text — now part of the
  // transcript — cannot self-satisfy transcriptHasLessons on the next call.
  emitAdditionalContext(
    `[LessonNudge] You just committed a fix/refactor but this session has no Lessons section yet. ` +
    `The memory pipeline sediments knowledge ONLY from a bolded Lessons: header in your reply ` +
    `(extracted → today.md → weekly → long-term). Root causes in the commit body or KNOWN_ISSUES never ` +
    `reach long-term — that gap is why project long-term stopped growing 2026-04-27 despite a month of ` +
    `heavy fixes. If this fix has a reusable lesson, add a bolded Lessons: section in your next reply, ` +
    `one bullet: - <symptom> -> <root cause / guard>. Abstract it (reusable across sessions), don't just ` +
    `restate the commit. Shown once per session.`
  );
  markNudged(transcriptPath);
  process.exit(0);
}

// Export internals for unit tests (per hooks/__tests__/README.md protocol).
module.exports = {
  LESSON_WORTHY,
  LESSON_WORTHY_CN,
  transcriptHasLessons,
  alreadyNudged,
  markNudged,
  STATE_FILE,
};

if (require.main === module) {
  try { main(); } catch { process.exit(0); }
}
