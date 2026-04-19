'use strict';

/**
 * proof-of-work.js — structured session evidence writer.
 *
 * Appends one JSON line per Stop event to:
 *   ~/.claude/state/proof-of-work.jsonl
 *
 * Purpose (2026-04-19 元反思): stop-summary.js already writes human-
 * readable today.md. New sessions can read that, but it's unstructured
 * — hard to programmatically query "did this session run /verify?",
 * "which files changed?", "did evaluation-loop pass?", etc.
 *
 * This lib emits a machine-readable audit row so future sessions,
 * dashboards, or evaluation tooling can grep / parse without LLM help.
 *
 * Schema (v1):
 * {
 *   v: 1,
 *   ts: <unix ms>,
 *   iso: "<ISO 8601 UTC>",
 *   session_id: "<uuid from transcript>",
 *   project: "<basename of project root>",
 *   project_root: "<absolute path>",
 *   mode: "fast" | "standard" | "heavy",
 *   git_head: "<short hash or null>",
 *   git_branch: "<name or null>",
 *   commits_this_session: [...short hashes],
 *   files_modified: [...relpaths], // git diff HEAD
 *   commands_invoked: [...strings],  // e.g. ["/verify", "/plan"]
 *   evaluation_loop_pass: true | false | null,
 *   evaluation_loop_pass_age_min: <number> | null,
 *   status: "complete" | "truncated"
 * }
 *
 * Consumers:
 *   - Humans: `tail -f ~/.claude/state/proof-of-work.jsonl | jq`
 *   - Future evaluation-gate variants that look back N sessions
 *   - Harness dashboards
 *
 * Non-blocking: never throws to caller. Errors go to stderr tag.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.claude', 'state');
const POW_FILE = path.join(STATE_DIR, 'proof-of-work.jsonl');
const EVAL_LAST_PASS = path.join(STATE_DIR, 'evaluation-gate', 'last-pass.json');

function safeExecStdout(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function gitMeta(cwd) {
  const head = safeExecStdout('git', ['rev-parse', '--short', 'HEAD'], cwd);
  const branch = safeExecStdout('git', ['symbolic-ref', '--short', 'HEAD'], cwd);
  const modifiedRaw = safeExecStdout('git', ['diff', '--name-only', 'HEAD'], cwd);
  const modified = modifiedRaw ? modifiedRaw.split('\n').filter(Boolean) : [];
  return { head, branch, modified };
}

function commitsThisSession(cwd, sessionStartMs) {
  if (!sessionStartMs) return [];
  const sinceIso = new Date(sessionStartMs).toISOString();
  const raw = safeExecStdout(
    'git',
    ['log', `--since=${sinceIso}`, '--pretty=%h'],
    cwd
  );
  return raw ? raw.split('\n').filter(Boolean) : [];
}

function readEvalLoopPass() {
  try {
    const raw = fs.readFileSync(EVAL_LAST_PASS, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data.ts !== 'number') return { pass: null, ageMin: null };
    const ageMin = Math.round((Date.now() - data.ts) / 60000);
    return { pass: true, ageMin };
  } catch {
    return { pass: null, ageMin: null };
  }
}

/**
 * Extract /command invocations from raw transcript JSONL stdin.
 * We look for assistant tool_use on SlashCommand or Bash starting "/"
 * plus user prompts that look like slash commands.
 */
function extractCommands(transcriptText) {
  if (!transcriptText || typeof transcriptText !== 'string') return [];
  const commands = new Set();
  const cmdRe = /(?:^|\s)(\/[a-z][a-z0-9:_-]*)/gi;
  // Sample: the transcript is a JSONL file, not the raw text. stop-summary
  // passes the stdin JSON (containing transcript_path), not the transcript
  // contents. So we only get commands if they appear in the JSON payload
  // itself, which usually they don't. Best-effort.
  let m;
  while ((m = cmdRe.exec(transcriptText)) !== null) {
    commands.add(m[1]);
  }
  return [...commands].slice(0, 20);
}

function readMode(cwd) {
  try {
    return fs.readFileSync(path.join(cwd, '.claude', '.task-mode'), 'utf8')
      .trim()
      .toLowerCase();
  } catch {
    return 'fast';
  }
}

function readSessionStart(cwd) {
  try {
    const p = path.join(cwd, '.claude', '.session-state', 'last-start.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return typeof data.ts === 'number' ? data.ts : null;
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

/**
 * Write a proof-of-work row to the jsonl file.
 * @param {object} opts
 *   projectRoot: string
 *   stdinJson: string (the raw stdin from Stop hook — contains session_id etc.)
 *   truncated: bool (did we skip any parsing due to size limits)
 */
function append({ projectRoot, stdinJson, truncated }) {
  try {
    let sessionId = null;
    try {
      const p = JSON.parse(stdinJson || '{}');
      sessionId = p.session_id || null;
    } catch {}

    const git = gitMeta(projectRoot);
    const sessionStart = readSessionStart(projectRoot);
    const commits = commitsThisSession(projectRoot, sessionStart);
    const evalPass = readEvalLoopPass();
    const mode = readMode(projectRoot);
    const commands = extractCommands(stdinJson);

    const row = {
      v: 1,
      ts: Date.now(),
      iso: new Date().toISOString(),
      session_id: sessionId,
      project: path.basename(projectRoot),
      project_root: projectRoot,
      mode,
      git_head: git.head,
      git_branch: git.branch,
      commits_this_session: commits,
      files_modified: git.modified,
      commands_invoked: commands,
      evaluation_loop_pass: evalPass.pass,
      evaluation_loop_pass_age_min: evalPass.ageMin,
      status: truncated ? 'truncated' : 'complete',
    };

    ensureDir(STATE_DIR);
    fs.appendFileSync(POW_FILE, JSON.stringify(row) + '\n');
  } catch (err) {
    // Non-blocking: stop-summary must not fail on PoW errors.
    process.stderr.write(`[proof-of-work] ${err && err.message ? err.message : err}\n`);
  }
}

module.exports = { append };
