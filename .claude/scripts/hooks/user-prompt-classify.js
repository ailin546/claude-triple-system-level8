#!/usr/bin/env node
/**
 * UserPromptSubmit hook: classifies user prompts by intent.
 *
 * Two responsibilities:
 *   1. Auto-escalate fast → standard when prompt contains bug-fix / problem-report keywords.
 *      Rationale: bug-fix tasks demand root-cause analysis (~/.claude/CLAUDE.md §编码行为准则 Rule 1).
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

// 2026-05-21: Phrases that suggest the user wants Claude to execute a
// pre-specified implementation (KNOWN_ISSUES M-X / Wave-N / Phase-X / spec
// document / backlog item / TODO list reference). Without reflection,
// Claude tends to accept the spec's stated size verbatim and skip
// "is this still needed?" / "已部分修过?" / "胶水覆盖?" pre-flight check.
//
// Match precision: bare keywords like "实施" alone are too noisy. We
// require co-occurrence with a spec reference token (M-NN / Wave-X /
// 实施 + Phase / backlog) or explicit "do this large task" framing.
const IMPLEMENTATION_INTENT_PATTERNS = [
  // Spec-reference tokens (KNOWN_ISSUES, OPTIMIZATION_BACKLOG, ADR, Wave, Phase)
  /\bM-\d{1,3}\b/,             // M-27, M-31, M-87
  /\bWave\s*\d+\b/i,            // Wave 4, Wave14
  /\bPhase\s*[1-9A-Z]\b/i,      // Phase 1, Phase D, Phase 2-lite
  /\bT[1-9]\d?\b/,              // T6, T7, T8 (OPTIMIZATION_BACKLOG tasks)
  /\bLEGACY-M\d{1,3}\b/,        // LEGACY-M27 etc
  // Imperative implementation framing
  /实施(?!细节|计划)/,            // 实施 but not 实施细节 / 实施计划 (discussion)
  /开始(?:做|实施|实现)/,
  /开干|动手做/,
  /做这[个件项]/,
  /按.{0,5}计划/,
  /按.{0,5}spec/i,
  /按.{0,5}backlog/i,
  /\bimplement(?:s|ed|ing)?\b/i,
  /\bexecute\s+the\s+plan\b/i,
  /\bproceed\s+with\b/i,
  /\bgo\s+ahead\b/i,
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

function detectImplementationIntent(prompt) {
  for (const re of IMPLEMENTATION_INTENT_PATTERNS) {
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
  const implHit = detectImplementationIntent(prompt);

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
      'This task involves fixing a problem. Apply the 3-step protocol from ~/.claude/CLAUDE.md §编码行为准则 Rule 1:',
      '  Step 1 — Root cause analysis: trace the bug to component + memory + data flow.',
      '            Decide: design problem (architecture change) or implementation bug (minimal fix)?',
      '  Step 2 — Solution review: is this eliminating root cause or bypassing symptom? Will it introduce new races/blocking? Latency impact? Live-trading impact? Simpler option?',
      '  Step 3 — Verification: ≥3 minute soak test, not instantaneous check.',
      '',
      'For complex fixes or when root cause is unclear, load ~/.claude/on-demand/coding-discipline.md for full anti-pattern table + 4-question solution review + symptom-phrase checklist.',
      '',
      'If you find yourself adding error handling / fallbacks / fixture fields without asking "why was this allowed in the first place" — STOP. That is symptom mode.',
      ''
    );
  }

  if (implHit) {
    lines.push(
      `[Scope-Reflection Required — matched "${implHit}"]`,
      '',
      'This prompt references a pre-specified implementation (KNOWN_ISSUES entry,',
      'Wave/Phase task, BACKLOG item, ADR plan). Before estimating work, run',
      'the 4-question size/timing/scope challenge — KNOWN_ISSUES specs are',
      'historical snapshots, not current truth:',
      '',
      '  ① **Is the issue recurrent or one-shot?** Read the entry — does it say',
      '     "single trade", "once", "已复现一次"? One-shot may not need ~150 LOC.',
      '',
      '  ② **Has the root cause been partially fixed already?** Grep commit log',
      '     for the M-X reference, related symbol names, or invariant numbers.',
      '     Wave-N entries often have round-K patches landed after the spec',
      '     was drafted — check "已修" / "✅" status in the source row.',
      '',
      '  ③ **Is the stated LOC / day estimate still accurate?** Specs written',
      '     N weeks ago may reflect outdated assumptions (deleted modules,',
      '     refactored APIs, type changes). Grep target symbols to verify.',
      '',
      '  ④ **Can a glue / single-point check at a downstream SSOT cover the same',
      '     intent for 1/5–1/100 the LOC?** Especially: persistence-boundary,',
      '     channel-boundary, or invariant-enforcement points often subsume',
      '     "rewrite parser to Result<T, E>" class refactors.',
      '',
      'Report your answers BEFORE estimating work or writing code. If user did',
      'NOT ask for this reflection, share findings + cheaper alternative + ROI',
      'comparison, then ask for confirmation.',
      '',
      'Reference: M-27/M-30 case (2026-05-21) — original spec deferred ~150 LOC',
      'type refactor; reflection found 30 LOC glue at db.rs persistence boundary',
      'covered all venues with ROI ~25-100×.',
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
