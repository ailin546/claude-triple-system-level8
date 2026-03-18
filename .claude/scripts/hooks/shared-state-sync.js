#!/usr/bin/env node
/**
 * Shared State Sync Hook (Stop)
 *
 * On every Stop event:
 * 1. Reads current board.json
 * 2. Cleans up stale agent entries (no heartbeat in 30min)
 * 3. Archives completed workflows
 * 4. Writes back atomically (write-to-tmp + rename)
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const SHARED_STATE_DIR = path.join(process.cwd(), '.claude', 'shared-state');
const BOARD_PATH = path.join(SHARED_STATE_DIR, 'board.json');
const DECISIONS_PATH = path.join(SHARED_STATE_DIR, 'decisions.log');
const ARTIFACTS_DIR = path.join(SHARED_STATE_DIR, 'artifacts');

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Atomic write: write to a temp file in the same directory, then rename.
 * rename() is atomic on POSIX; on Windows it's close enough for our use.
 */
function writeJSONAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpName = `.board-${crypto.randomBytes(4).toString('hex')}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function appendDecision(agentId, action, description) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${agentId}] [${action}] ${description}\n`;
  fs.appendFileSync(DECISIONS_PATH, line, 'utf8');
}

function main() {
  if (!fs.existsSync(BOARD_PATH)) return;

  const board = readJSON(BOARD_PATH);
  if (!board || !board.agents) return;

  const now = Date.now();
  let changed = false;

  // Clean up stale agents.
  // Prefer lastHeartbeat (updated by the agent during activity),
  // fall back to startedAt for backwards compatibility.
  for (const agent of board.agents) {
    if (agent.status === 'running') {
      const heartbeat = agent.lastHeartbeat || agent.startedAt;
      if (!heartbeat) continue; // No timestamp — skip, don't break
      const lastUpdate = new Date(heartbeat).getTime();
      if (isNaN(lastUpdate)) continue; // Invalid date — skip
      if (now - lastUpdate > STALE_THRESHOLD_MS) {
        agent.status = 'stale';
        appendDecision('system', 'CLEANUP', `Agent ${agent.id} marked stale (no activity for 30min)`);
        changed = true;
      }
    }
  }

  // Remove completed agents older than 1 hour, and stale agents
  const ONE_HOUR = 60 * 60 * 1000;
  const beforeCount = board.agents.length;
  board.agents = board.agents.filter(a => {
    if (a.status === 'completed' && a.completedAt) {
      return now - new Date(a.completedAt).getTime() < ONE_HOUR;
    }
    if (a.status === 'stale') return false;
    return true;
  });
  if (board.agents.length !== beforeCount) changed = true;

  // Check if all tasks completed → archive workflow
  if (board.tasks && board.tasks.length > 0 && board.tasks.every(t => t.status === 'completed')) {
    const workflowId = board.activeWorkflow || `workflow-${Date.now()}`;
    const archiveDir = path.join(ARTIFACTS_DIR, workflowId);

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    writeJSONAtomic(path.join(archiveDir, 'board-final.json'), board);
    appendDecision('system', 'ARCHIVE', `Workflow ${workflowId} completed — all ${board.tasks.length} tasks done`);

    board.tasks = [];
    board.agents = [];
    board.conflicts = [];
    board.activeWorkflow = null;
    changed = true;
  }

  if (changed) {
    board.lastUpdated = new Date().toISOString();
    writeJSONAtomic(BOARD_PATH, board);
  }
}

// Read stdin (Claude Code hook protocol) then run
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk.substring(0, 1024 * 1024); });
process.stdin.on('end', () => {
  try { main(); } catch (err) {
    console.error('[SharedStateSync] Error:', err.message);
  }
  process.exit(0);
});
