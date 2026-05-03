#!/usr/bin/env node
/**
 * UserPromptSubmit hook: classifies user prompts by intent.
 *
 * Two responsibilities:
 *   1. Auto-escalate fast → standard when prompt contains bug-fix / problem-report keywords.
 *      Rationale: bug-fix tasks demand root-cause analysis (CLAUDE.md §编码行为准则 Rule 1).
 *      Letting them stay in Fast mode trains Claude to default to "symptom fix" reflex.
 *      Escalating to Standard surfaces /plan / /tdd / evaluation prompts the user can ignore
 *      but is a constant reminder that this isn't a "single-file small edit".
 *
 *   2. On first prompt of session, inject a depth-assessment reminder into context.
 *      Forces Claude to classify the task as symptom-level / behavior-level / root-cause-level
 *      before starting, instead of sliding into the deepest reflex (which is "fast").
 *
 * stdin: JSON { prompt, session_id, transcript_path, ... }
 * stdout: optional context injection (becomes part of Claude's context)
 * stderr: visible diagnostics (escalation notices)
 *
 * Non-blocking: errors fall through silently.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.claude', 'state');
const FIRST_PROMPT_STATE = path.join(STATE_DIR, 'session-first-prompt.json');

// Bug-fix / problem-report keywords. Tuned for low false positive on
// pure questions ("how does X work") and pure feature requests ("add Y").
// Negative space matters as much as positive: avoid over-eager escalation
// on neutral queries.
const FIX_KEYWORDS = [
  // English
  /\bbug\b/i,
  /\bfix(?:es|ed|ing)?\b/i,
  /\bbroken\b/i,
  /\bcrash(?:es|ed|ing)?\b/i,
  /\bregression\b/i,
  /\bincident\b/i,
  /\bdoesn'?t\s+work\b/i,
  /\bnot\s+working\b/i,
  /\bfail(?:s|ed|ing|ure)?\b/i,
  /\berror\b/i,
  /\bissue\b/i,
  /\bwrong\b/i,
  /\bunexpected\b/i,
  // Chinese
  /修(?!改|改一下)/, // 修 but not 修改/修改一下 (which is often refactor not bugfix)
  /修复/,
  /修一下/,
  /故障/,
  /事故/,
  /崩溃/,
  /出错/,
  /出问题/,
  /异常/,
  /失败/,
  /不对/,
  /不工作/,
  /没生效/,
  /没起作用/,
  /回归/,
  /复现/,
];

// Phrases that strongly suggest the user wants a SYMPTOM fix (and Claude
// should resist). When matched, inject extra context warning Claude.
const SHORTCUT_REQUEST_PATTERNS = [
  /快速修复/,
  /quick fix/i,
  /minimal fix/i,
  /最小修复/,
  /先这样/,
  /先绕过/,
  /workaround/i,
  /先打个补丁/,
  /快速搞定/,
];

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

function isFirstPromptOfSession(sessionId) {
  if (!sessionId) return false;
  try {
    const raw = fs.readFileSync(FIRST_PROMPT_STATE, 'utf8');
    const data = JSON.parse(raw);
    if (data.session_id === sessionId && data.first_seen) return false;
  } catch {
    // not yet recorded or unreadable → treat as first
  }
  return true;
}

function recordFirstPrompt(sessionId) {
  if (!sessionId) return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(FIRST_PROMPT_STATE, JSON.stringify({
      session_id: sessionId,
      first_seen: Date.now()
    }));
  } catch {
    // non-fatal
  }
}

function detectFixIntent(prompt) {
  for (const re of FIX_KEYWORDS) {
    const m = prompt.match(re);
    if (m) return m[0];
  }
  return null;
}

function detectShortcutRequest(prompt) {
  for (const re of SHORTCUT_REQUEST_PATTERNS) {
    const m = prompt.match(re);
    if (m) return m[0];
  }
  return null;
}

function main() {
  let parsed = null;
  try {
    parsed = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // non-fatal
  }
  const prompt = (parsed && parsed.prompt) || '';
  const sessionId = (parsed && parsed.session_id) || '';

  if (!prompt) process.exit(0);

  const isFirst = isFirstPromptOfSession(sessionId);
  if (isFirst) recordFirstPrompt(sessionId);

  const fixHit = detectFixIntent(prompt);
  const shortcutHit = detectShortcutRequest(prompt);

  // Auto-escalate fast → standard on fix intent.
  if (fixHit) {
    const modeLib = safeRequire('../lib/mode-check');
    if (modeLib) {
      const cur = modeLib.getCurrentMode();
      if (cur === 'fast') {
        try {
          modeLib.setMode('standard');
          modeLib.appendModeTrace({
            trigger: 'user-prompt-classify',
            prev_mode: 'fast',
            next_mode: 'standard',
            reason: `bug-fix keyword in user prompt: "${fixHit}"`,
            matched_signal: fixHit,
            overridden_by_user: false
          });
          console.error(`[PromptClassify] Mode escalated: fast → standard (matched "${fixHit}" — bug-fix work needs root-cause analysis, not symptom patching). To stay in fast for this turn, /set-mode fast --reset --reason "..."`);
        } catch (e) {
          console.error(`[PromptClassify] Escalation failed: ${e.message}`);
        }
      }
    }
  }

  // Build context injection (printed to stdout → becomes Claude context).
  const lines = [];

  if (isFirst) {
    lines.push(
      '[Depth Assessment Required — First Prompt of Session]',
      '',
      'Before doing any work, classify this task in your first response:',
      '  - **Symptom-level**: hide/work-around the visible problem (only allowed for genuine hotfix救火)',
      '  - **Behavior-level**: change observable behavior, accept architectural status quo',
      '  - **Root-cause level**: identify why the system allowed the problem; fix the cause',
      '',
      'For fix/bug/事故/异常/test-failure tasks, default to root-cause level.',
      '~/.claude/CLAUDE.md §编码行为准则 Rule 1 (root-cause-first) overrides Rule 2 (surgical-changes).',
      'Forbidden phrases that signal you slipped into symptom mode: "10分钟小改" / "顺手修了" / "minimal fix" / "先这样".',
      ''
    );
  }

  if (fixHit) {
    lines.push(
      `[Fix-Intent Detected — matched "${fixHit}"]`,
      '',
      'This task involves fixing a problem. Apply the 3-step protocol from project CLAUDE.md §十一:',
      '  Step 1 — Root cause analysis: trace the bug to component + memory + data flow.',
      '            Decide: design problem (architecture change) or implementation bug (minimal fix)?',
      '  Step 2 — Solution review: is this eliminating root cause or bypassing symptom? Will it introduce new races/blocking? Latency impact? Live-trading impact? Simpler option?',
      '  Step 3 — Verification: ≥3 minute soak test, not instantaneous check.',
      '',
      'If you find yourself adding error handling / fallbacks / fixture fields without asking "why was this allowed in the first place" — STOP. That is symptom mode.',
      ''
    );
  }

  if (shortcutHit) {
    lines.push(
      `[Shortcut Request Detected — matched "${shortcutHit}"]`,
      '',
      'The user (or a remembered phrase) is asking for a quick/minimal fix. Default response:',
      '',
      '> "I can do a symptom fix, but the root cause is X. The fast fix lets the same class of bug come back. Do you want symptom-only (with a TODO for root cause) or root-cause now?"',
      '',
      'Symptom fixes are allowed only when explicitly chosen AND a follow-up tracker (TODO/issue) is created.',
      ''
    );
  }

  if (lines.length > 0) {
    process.stdout.write(lines.join('\n') + '\n');
  }

  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0); // never block
}
