#!/usr/bin/env node
/**
 * evaluation-gate.js — PreToolUse hook
 *
 * Hard-blocks `git commit` / `git push` when the current session is in
 * Heavy mode but the evaluation-loop skill has not recently produced a
 * passing verdict.
 *
 * Rationale (2026-04-19 元反思):
 *   - Rule layer (CLAUDE.md §50, workflow.md §56, verify.md §69) already
 *     says Heavy tasks should route through evaluation-loop before ship.
 *   - But rule-layer is Claude self-discipline, and Claude skips it.
 *   - Today's 4-batch Heavy session went live with zero Reality Checker
 *     calls and full self-certification.
 *   - This hook enforces at the commit boundary.
 *
 * Signal source:
 *   State file `~/.claude/state/evaluation-gate/last-pass.json`.
 *   The evaluation-loop skill writes this file when Step 4 (Reality
 *   Checker) returns verdict == ACCEPTED. See skill SKILL.md.
 *
 * Gate logic:
 *   1. Only inspects Bash tool with `git commit` or `git push` cmd.
 *   2. Reads `.claude/.task-mode` (project-local); if not heavy → pass.
 *   3. Reads `last-pass.json`; validates schema; if stale or invalid → block.
 *   4. Block = exit 2 with stderr message telling Claude to run
 *      `/evaluation-loop` or `/verify pre-pr`.
 *
 * Anti-forgery (2026-04-19 Reality Checker audit fix):
 *   - marker must include `git_head` (short hash) matching current HEAD.
 *     If any code changes after the marker was written, `git_head` diverges
 *     and the marker is rejected — forces re-evaluation after edits.
 *   - marker must include non-empty `evaluator_agent_id` and
 *     `verdict_summary`. Missing or placeholder values (length < 10)
 *     are treated as forged.
 *
 * Non-blocking on error: any internal failure passes through. The gate
 * must never strand the user because of hook bugs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.claude', 'state', 'evaluation-gate');
const LAST_PASS_FILE = path.join(STATE_DIR, 'last-pass.json');
const STALE_HOURS = 2;
const MIN_SUMMARY_LEN = 10;

function currentGitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readStdinJSON() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getProjectRoot(payload) {
  return (
    payload.cwd ||
    payload.workspace ||
    process.env.CLAUDE_PROJECT_ROOT ||
    process.cwd()
  );
}

function readTaskMode(projectRoot) {
  try {
    const p = path.join(projectRoot, '.claude', '.task-mode');
    return fs.readFileSync(p, 'utf8').trim().toLowerCase();
  } catch {
    return 'fast';
  }
}

function isCommitOrPush(cmd) {
  if (typeof cmd !== 'string') return false;
  return /(^|[\s;&|])git\s+(commit|push)\b/.test(cmd);
}

function readLastPass() {
  try {
    const raw = fs.readFileSync(LAST_PASS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  const payload = readStdinJSON();
  const toolName = payload.tool_name || '';
  if (toolName !== 'Bash') {
    process.exit(0);
  }
  const cmd = (payload.tool_input && payload.tool_input.command) || '';
  if (!isCommitOrPush(cmd)) {
    process.exit(0);
  }

  const projectRoot = getProjectRoot(payload);
  const mode = readTaskMode(projectRoot);
  if (mode !== 'heavy') {
    process.exit(0);
  }

  const lastPass = readLastPass();
  const now = Date.now();
  const staleThresholdMs = STALE_HOURS * 60 * 60 * 1000;

  // Validate marker in layers — any failure blocks with a specific hint.
  let reason = null;
  if (!lastPass) {
    reason = 'evaluation-loop has never run (or state file missing)';
  } else if (!lastPass.ts) {
    reason = 'marker missing `ts` field';
  } else if (now - lastPass.ts > staleThresholdMs) {
    reason = `last pass was ${Math.round((now - lastPass.ts) / 60000)} min ago, stale (> ${STALE_HOURS}h)`;
  } else if (!lastPass.git_head) {
    reason = 'marker missing `git_head` — Reality Checker output must anchor to a commit';
  } else {
    const head = currentGitHead(projectRoot);
    if (head && head !== lastPass.git_head) {
      reason = `marker git_head=${lastPass.git_head} diverges from current HEAD=${head}; code changed since evaluation — re-run`;
    } else if (!lastPass.evaluator_agent_id || String(lastPass.evaluator_agent_id).length < 3) {
      reason = 'marker missing `evaluator_agent_id` (Task tool agent id of the independent Reality Checker)';
    } else if (
      !lastPass.verdict_summary ||
      String(lastPass.verdict_summary).trim().length < MIN_SUMMARY_LEN
    ) {
      reason = `marker \`verdict_summary\` too short (< ${MIN_SUMMARY_LEN} chars) — paste the Reality Checker verdict, not a placeholder`;
    }
  }

  if (reason) {
    const msg =
      `[evaluation-gate] BLOCK: Heavy mode commit without valid evaluation-loop pass.\n` +
      `  Reason: ${reason}\n` +
      `  Fix:\n` +
      `    1. Run \`/evaluation-loop\` (preferred) or \`/verify pre-pr\`\n` +
      `    2. When Reality Checker returns ACCEPTED, write the marker with Write tool:\n` +
      `       path: ~/.claude/state/evaluation-gate/last-pass.json\n` +
      `       schema: {"ts": <Date.now()>, "git_head": "<short hash of HEAD>",\n` +
      `                "mode": "heavy", "round": <N>,\n` +
      `                "evaluator_agent_id": "<Task agent id>",\n` +
      `                "verdict_summary": "<Reality Checker's one-line ACCEPTED reason, >=10 chars>"}\n` +
      `    3. Retry the git commit\n` +
      `  Rationale: CLAUDE.md §50 Heavy chain requires evaluation-loop\n` +
      `             before ship. This hook enforces that at commit time.\n` +
      `             git_head pin ensures marker invalidates on any code change.\n`;
    process.stderr.write(msg);
    process.exit(2);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(
    `[evaluation-gate] non-fatal error: ${err && err.message ? err.message : err}\n`
  );
  process.exit(0); // never block on hook bug
}
