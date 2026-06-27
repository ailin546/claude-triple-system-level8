#!/usr/bin/env node
/**
 * PostToolUse(Edit|Write) hook: when an edit ADDS a known SSOT-risk access
 * pattern — a presentation-layer component reaching for a secondary data
 * source, or a Rust deploy-frozen config map read — nudge Claude to use the
 * canonical accessor instead. Once per (session, file, pattern).
 *
 * Why this exists (2026-06-27):
 *   A recurring bug class: a logical field grows a 2nd physical source; a new
 *   feature reads the new source while old consumers keep reading the stale
 *   one (or vice-versa) → drift → SSOT violation. Four such bugs landed in a
 *   single session (market bid/ask proxy-vs-engine, leg position perp-vs-mid,
 *   entry_threshold deploy-copy-vs-ArcSwap, raw-vs-net spread). The SSOT
 *   principle exists as a rule but nothing makes the wrong source unreachable
 *   or the right one un-bypassable. This hook is the same reliability move as
 *   fix-depth-check / lesson-nudge: a rule was ~0% self-enforced; a soft
 *   commit/edit-time nudge makes it reliable.
 *
 * Design (consensus with Codex 2026-06-27 — narrowed to EXACT high-signal
 * patterns to keep the false-positive rate near zero):
 *   - It only inspects the ADDED text (Edit new_string / Write content /
 *     MultiEdit edits[].new_string), not the whole file — so it fires on
 *     newly-introduced reads, not pre-existing ones.
 *   - The pattern table below is the seed (CCHFT shapes). It is intentionally
 *     small and extensible; generic noisy heuristics (any component `fetch(`,
 *     "second ArcSwap/Mutex", generic `.get(symbol)`) were deliberately
 *     dropped — they flag legitimate code (LoginGate / IndexComponentsCard /
 *     SpotTrading widgets) and drown the signal.
 *
 * Non-blocking (exit 0). Prints to stderr (visible to Claude). Passthrough
 * stdin (PostToolUse data-flow contract; matches lesson-nudge/fault-hint).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(process.env.HOME || '/home/ubuntu', '.claude', 'state');
const STATE_FILE = path.join(STATE_DIR, 'ssot-source-guard.json');

// A presentation-layer file = a React component/page/view (not services/hooks
// data layer). Reaching for a raw data source from here is the smell.
// Scope: .tsx/.jsx/.vue (the stacks this project + the seed patterns target).
const PRESENTATION_FILE = /(?:^|\/)(?:components|pages|views)\/.*\.(?:tsx|jsx|vue)$/;

// Pattern table (seed). Each entry: { id, fileTest(filePath)->bool, pattern,
// hint }. fileTest narrows by location so the same string in the canonical
// layer (services/, a dedicated hook) does not nudge.
const PATTERNS = [
  {
    id: 'rust-strategy-configs-direct',
    fileTest: (fp) => fp.endsWith('.rs'),
    // Deploy-frozen config map. Canonical = effective_config()
    // (ArcSwap hot-reload → fallback). Direct reads drift on hot edit.
    pattern: /\bstrategy_configs\.get\(/,
    hint: 'Rust 直读 deploy 烧录的 strategy_configs.get(...) — 用 effective_config()（ArcSwap 热更新 SSOT），否则热更新后读到 stale 值',
  },
  {
    id: 'fe-market-mid-in-presentation',
    fileTest: (fp) => PRESENTATION_FILE.test(fp),
    // Public ticker hook used directly in a component. Canonical =
    // useMarketPrice() (engine-first, proxy fallback).
    pattern: /\buseMarketMidPrice\b/,
    hint: '组件层直接用 useMarketMidPrice（公共 ticker，墙内 testnet 不可达）— 用 engine-first 的 canonical hook（引擎 book → 公共 ticker fallback）',
  },
  {
    id: 'fe-proxy-in-presentation',
    fileTest: (fp) => PRESENTATION_FILE.test(fp),
    // Raw public-market proxy path literal in a component. Belongs in the
    // services/ data layer behind a canonical accessor.
    pattern: /['"`]\/proxy-/,
    hint: '组件层硬编码 /proxy-* 公共行情路径 — 行情拉取应在 services/ 层并经 engine-first 访问器；组件只读 canonical hook',
  },
];

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * Lines genuinely ADDED by a replacement: lines present in `next` but not in
 * `prev` (multiset-insensitive — a line also present in prev is treated as
 * retained, so an Edit that merely keeps an existing violation does NOT fire).
 * Conservative by design: prefers a false-negative (miss a re-added dup) over
 * a false-positive (flag retained code). When prev is empty (Write / new
 * file / Edit with no old_string), all of next counts as added.
 */
function addedLines(prev, next) {
  const prevSet = new Set(String(prev || '').split('\n'));
  return String(next || '')
    .split('\n')
    .filter((line) => !prevSet.has(line))
    .join('\n');
}

/**
 * Extract the text this tool call ADDS to the file (not the whole file, and
 * not retained text). Edit/MultiEdit diff new_string against old_string so a
 * replacement that keeps an existing read is not mistaken for a new one
 * (Codex P1). Write has no diff base → its full content counts as added.
 */
function extractAddedText(toolName, toolInput) {
  if (!toolInput) return '';
  if (toolName === 'Write') return String(toolInput.content || '');
  if (toolName === 'Edit') return addedLines(toolInput.old_string, toolInput.new_string);
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) {
    return toolInput.edits
      .map((e) => addedLines(e && e.old_string, e && e.new_string))
      .join('\n');
  }
  return '';
}

/**
 * Strip comment content so a comment that merely mentions a forbidden pattern
 * (e.g. a line comment "fallback to strategy_configs.get", or an inline block
 * comment wrapping "useMarketMidPrice") does not nudge. Handles: inline block
 * comments, an unterminated block opener to EOL, leading-star block lines, and
 * line comments — but NOT the "//" inside a URL scheme ("http://...") so a
 * real /proxy- in a URL still matches (Codex P2).
 */
function stripComments(text) {
  return text
    .split('\n')
    .map((line) => {
      // leading-star line inside a /** */ block → entirely comment.
      if (/^\s*\*/.test(line)) return '';
      let s = line;
      s = s.replace(/\/\*.*?\*\//g, ''); // inline block comment(s)
      const open = s.indexOf('/*');       // unterminated block opener → EOL
      if (open >= 0) s = s.slice(0, open);
      s = s.replace(/(^|[^:])\/\/.*$/, '$1'); // // line comment, but keep ://
      return s;
    })
    .join('\n');
}

/** Returns the list of matched pattern entries for this edit. */
function detect(filePath, addedText) {
  const code = stripComments(addedText);
  const out = [];
  for (const p of PATTERNS) {
    if (p.fileTest(filePath) && p.pattern.test(code)) out.push(p);
  }
  return out;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch { /* ignore */ }
  return { transcript: null, seen: {} };
}

function saveState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch { /* ignore */ }
}

/**
 * Per-(session, file, pattern) dedup. Resets the seen set when the transcript
 * (≈ session) changes, like lesson-nudge's per-transcript model. Returns the
 * subset of matches that have NOT yet been nudged this session, and records
 * them as seen.
 */
function filterUnseen(state, transcript, filePath, matches) {
  if (state.transcript !== transcript) {
    state.transcript = transcript;
    state.seen = {};
  }
  const fresh = [];
  for (const m of matches) {
    const key = `${filePath}::${m.id}`;
    if (!state.seen[key]) {
      state.seen[key] = Date.now();
      fresh.push(m);
    }
  }
  return fresh;
}

function main() {
  const raw = readStdin();
  process.stdout.write(raw); // passthrough (PostToolUse contract)

  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  if (!parsed) process.exit(0);

  const toolName = parsed.tool_name;
  if (toolName !== 'Edit' && toolName !== 'Write' && toolName !== 'MultiEdit') process.exit(0);

  const toolInput = parsed.tool_input || {};
  const filePath = String(toolInput.file_path || '');
  if (!filePath) process.exit(0);

  const added = extractAddedText(toolName, toolInput);
  if (!added) process.exit(0);

  const matches = detect(filePath, added);
  if (matches.length === 0) process.exit(0);

  const transcript = parsed.transcript_path || process.env.CLAUDE_TRANSCRIPT_PATH || 'no-transcript';
  const state = loadState();
  const fresh = filterUnseen(state, transcript, filePath, matches);
  if (fresh.length === 0) process.exit(0);
  saveState(state);

  const lines = fresh.map((m) => `[SSOT 单一访问器] ${m.hint}`);
  console.error(
    `${lines.join('\n')}\n` +
    `[SSOT 单一访问器] 该数据是否已有 canonical 访问器？直接读底层源/新增取数路径前先 grep；引入新源须在同一改动里回收旧消费者。\n` +
    `[SSOT 单一访问器] 详见 ~/.claude/CLAUDE.md §SSOT 单一访问器铁律（每会话每文件提示一次）。\n`
  );
  process.exit(0);
}

// Export internals for unit tests (per hooks/__tests__/README.md protocol).
module.exports = {
  PATTERNS,
  PRESENTATION_FILE,
  addedLines,
  extractAddedText,
  stripComments,
  detect,
  filterUnseen,
  STATE_FILE,
};

if (require.main === module) {
  try { main(); } catch { process.exit(0); }
}
