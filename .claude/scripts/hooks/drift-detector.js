#!/usr/bin/env node
/**
 * Agent Drift Detector — WTF-Likelihood Heuristic
 *
 * PostToolUse hook that tracks a "suspicion score" to detect when an agent
 * is going off track (repeated reverts, touching too many directories,
 * editing same file repeatedly, consecutive test failures).
 *
 * Inspired by gstack's QA WTF-likelihood mechanism.
 *
 * Score accumulates per session:
 *   +15% — git revert or undo operation
 *   +10% — editing files across 5+ different directories
 *   +5%  — same file edited 3+ times
 *   +5%  — consecutive test failures (3+)
 *   -5%  — test transitioning from fail to pass
 *
 * At 20%: warning message
 * At 40%: block with recommendation to /verify
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getProjectRoot } = require('../lib/project-root');
const PROJECT_ROOT = getProjectRoot();

// ── Mode gate: Standard+ only ───────────────────────────────
const { requireMode } = require('../lib/mode-check');
const { emitAdditionalContext } = require('../lib/hook-output');
if (!requireMode('standard')) {
  // Fast mode — skip drift detection. Drain stdin and exit silently (no
  // passthrough: stdout is reserved for the additionalContext JSON envelope).
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => process.exit(0));
  return;
}
// ─────────────────────────────────────────────────────────────
const SESSION_ID = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
const STATE_DIR = path.join(PROJECT_ROOT, '.claude', '.drift-state');
const STATE_FILE = path.join(STATE_DIR, `${SESSION_ID}.json`);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {
      score: 0,
      editedFiles: {},      // file -> edit count
      editedDirs: [],        // unique directories (array for JSON serialization)
      consecutiveTestFails: 0,
      lastTestPassed: null,
      revertCount: 0,
    };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    // Convert Set to array for JSON serialization
    const serializable = {
      ...state,
      editedDirs: Array.isArray(state.editedDirs) ? state.editedDirs : [...state.editedDirs],
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
  } catch {
    // Non-critical — if we can't save, we lose tracking but don't break the session
  }
}

function main() {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    data += chunk;
  });

  process.stdin.on('end', () => {
    processInput(data);
  });
}

function processInput(input) {
  let toolResult;
  try {
    toolResult = JSON.parse(input);
  } catch {
    return;
  }

  const toolName = toolResult.tool_name || '';
  const toolInput = toolResult.tool_input || {};
  const toolOutput = toolResult.tool_output || '';

  const state = loadState();

  // Ensure editedDirs is a Set
  if (Array.isArray(state.editedDirs)) {
    state.editedDirs = new Set(state.editedDirs);
  } else if (!(state.editedDirs instanceof Set)) {
    state.editedDirs = new Set();
  }

  let scoreChanged = false;

  // Track file edits
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    if (filePath) {
      // Track edit count per file — only add score at threshold crossings (3, 6, 9...)
      state.editedFiles[filePath] = (state.editedFiles[filePath] || 0) + 1;
      if (state.editedFiles[filePath] >= 3 && state.editedFiles[filePath] % 3 === 0) {
        state.score += 5;
        scoreChanged = true;
      }

      // Track unique directories
      const dir = path.dirname(filePath);
      state.editedDirs.add(dir);
      if (state.editedDirs.size >= 5 && state.editedDirs.size % 5 === 0) {
        state.score += 10;
        scoreChanged = true;
      }
    }
  }

  // Detect reverts in Bash commands
  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (/\bgit\s+revert\b/.test(command) || /\bgit\s+checkout\s+--\s/.test(command) || /\bgit\s+restore\b/.test(command)) {
      state.revertCount += 1;
      state.score += 15;
      scoreChanged = true;
    }

    // Detect test results
    const output = typeof toolOutput === 'string' ? toolOutput : '';
    const isTestCommand = /\b(test|jest|vitest|pytest|cargo test|go test|bun test|npm test)\b/.test(command);
    if (isTestCommand) {
      const testFailed = /FAIL|FAILED|ERROR|error:|failed/i.test(output) && !/0 failed/i.test(output);
      if (testFailed) {
        state.consecutiveTestFails += 1;
        if (state.consecutiveTestFails >= 3) {
          state.score += 5;
          scoreChanged = true;
        }
        state.lastTestPassed = false;
      } else {
        if (state.lastTestPassed === false) {
          // Test went from fail to pass — reduce suspicion
          state.score = Math.max(0, state.score - 5);
          scoreChanged = true;
        }
        state.consecutiveTestFails = 0;
        state.lastTestPassed = true;
      }
    }
  }

  saveState(state);

  // Emit warnings based on score.
  // NOTE: PostToolUse hooks cannot block (tool already executed). Warnings are
  // injected via additionalContext (visible to the model — plain stderr on an
  // exit-0 PostToolUse hook is NOT, see lib/hook-output.js).
  // Both branches gate on scoreChanged so the same warning is not re-injected on
  // every subsequent tool call once a threshold is reached (additionalContext
  // enters context — unlike the old stderr, repeats would be real noise).
  if (state.score >= 40 && scoreChanged) {
    emitAdditionalContext(
      `[drift-detector] CRITICAL: drift score ${state.score}%! ` +
      `Reverts: ${state.revertCount}, Dirs touched: ${state.editedDirs.size}, ` +
      `Consecutive test fails: ${state.consecutiveTestFails}. ` +
      `STOP and run /verify before continuing.`
    );
  } else if (state.score >= 20 && scoreChanged) {
    emitAdditionalContext(
      `[drift-detector] Warning: drift score ${state.score}%. ` +
      `Consider pausing to verify direction is correct.`
    );
  }
}

main();
