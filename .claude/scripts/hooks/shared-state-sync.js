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
const crypto = require('crypto');

// ── Mode gate: Heavy only ────────────────────────────────────
try {
  const { requireMode } = require('../lib/mode-check');
  if (!requireMode('heavy')) {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { d += c; });
    process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
    return;
  }
} catch { /* mode-check not available — run anyway */ }
// ─────────────────────────────────────────────────────────────

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
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

function appendDecision(agentId, action, description) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${agentId}] [${action}] ${description}\n`;
  fs.appendFileSync(DECISIONS_PATH, line, 'utf8');
}

const EXPECTED_SCHEMA_VERSION = 1;

function main() {
  if (!fs.existsSync(BOARD_PATH)) return;

  const board = readJSON(BOARD_PATH);
  if (!board) {
    console.error('[SharedStateSync] DEGRADED: board.json unreadable, skipping sync');
    return;
  }

  // ── Version check ──
  if (board.version && board.version !== EXPECTED_SCHEMA_VERSION) {
    console.error(`[SharedStateSync] DEGRADED: schema version mismatch (expected ${EXPECTED_SCHEMA_VERSION}, got ${board.version})`);
    appendDecision('system', 'DEGRADE', `Schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${board.version}`);
    return;
  }

  // Support both old (agents) and new (workers) schema
  const workers = board.workers || board.agents || [];
  const now = Date.now();
  let changed = false;

  // ── Clean up stale workers ──
  for (const worker of workers) {
    if (worker.status === 'active' || worker.status === 'running') {
      const heartbeat = worker.last_heartbeat || worker.lastHeartbeat || worker.startedAt;
      if (!heartbeat) continue;
      const lastUpdate = new Date(heartbeat).getTime();
      if (isNaN(lastUpdate)) continue;
      if (now - lastUpdate > STALE_THRESHOLD_MS) {
        const prevStatus = worker.status;
        worker.status = 'stale';
        // Reclaim tasks and release file claims from stale workers
        const workerId = worker.agent_id || worker.id;
        if (board.tasks) {
          for (const task of board.tasks) {
            if (task.owner === workerId || task.assignedAgent === workerId) {
              const prevStatus = task.status;
              const prevOwner = task.owner || task.assignedAgent;
              // Release file claims
              task.files_claimed = [];
              // Clear ownership so task can be reassigned
              if (task.owner) task.owner = null;
              if (task.assignedAgent) task.assignedAgent = null;
              // Reset status: in_progress → pending (re-assignable);
              // blocked stays blocked (may have external dependency);
              // completed stays completed (work was done)
              if (task.status === 'in_progress') {
                task.status = 'pending';
              }
              // Preserve handoff context
              const handoffNote = `[auto-reclaimed] Was owned by ${prevOwner} (${prevStatus}), worker went stale`;
              task.handoff_note = task.handoff_note
                ? `${task.handoff_note}\n${handoffNote}`
                : handoffNote;
              appendDecision('system', 'RECLAIM', `Task ${task.task_id || task.id}: owner cleared, status ${prevStatus} → ${task.status}, files released (stale worker: ${workerId})`);
            }
          }
        }
        appendDecision('system', 'CLEANUP', `Worker ${worker.agent_id || worker.id} marked stale (was: ${prevStatus}, no heartbeat for 30min)`);
        changed = true;
      }
    }
  }

  // ── Remove stale and old completed workers ──
  const ONE_HOUR = 60 * 60 * 1000;
  const beforeCount = workers.length;
  const filteredWorkers = workers.filter(w => {
    if (w.status === 'completed' && (w.completedAt || w.updated_at)) {
      const ts = w.completedAt || w.updated_at;
      return now - new Date(ts).getTime() < ONE_HOUR;
    }
    if (w.status === 'stale') return false;
    return true;
  });
  if (filteredWorkers.length !== beforeCount) changed = true;

  // ── File claim conflict detection ──
  if (board.tasks && board.tasks.length > 0) {
    const fileClaims = new Map(); // file → [task_id]
    for (const task of board.tasks) {
      if (task.files_claimed && task.status !== 'completed') {
        for (const file of task.files_claimed) {
          if (!fileClaims.has(file)) fileClaims.set(file, []);
          fileClaims.get(file).push(task.task_id || task.id);
        }
      }
    }
    for (const [file, tasks] of fileClaims) {
      if (tasks.length > 1) {
        console.error(`[SharedStateSync] CONFLICT: file ${file} claimed by tasks: ${tasks.join(', ')}`);
        appendDecision('system', 'CONFLICT', `File claim conflict: ${file} claimed by ${tasks.join(', ')}`);
      }
    }
  }

  // ── Archive completed workflows ──
  if (board.tasks && board.tasks.length > 0 && board.tasks.every(t => t.status === 'completed')) {
    const workflowId = board.workflow_id || board.activeWorkflow || `workflow-${Date.now()}`;
    const archiveDir = path.join(ARTIFACTS_DIR, workflowId);

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    writeJSONAtomic(path.join(archiveDir, 'board-final.json'), board);
    appendDecision('system', 'ARCHIVE', `Workflow ${workflowId} completed — all ${board.tasks.length} tasks done`);

    board.tasks = [];
    board.workflow_id = null;
    board.activeWorkflow = null;
    changed = true;
  }

  // Write back with updated workers
  if (board.workers) {
    board.workers = filteredWorkers;
  } else if (board.agents) {
    board.agents = filteredWorkers;
  }

  if (changed) {
    board.lastUpdated = new Date().toISOString();
    try {
      writeJSONAtomic(BOARD_PATH, board);
    } catch (err) {
      console.error(`[SharedStateSync] DEGRADED: board write failed — ${err.message}`);
      appendDecision('system', 'DEGRADE', `Board write failed: ${err.message}`);
    }
  }
}

// Read stdin (Claude Code hook protocol) then run
const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    const remaining = MAX_STDIN - stdinData.length;
    stdinData += chunk.substring(0, remaining);
  }
});
process.stdin.on('end', () => {
  try { main(); } catch (err) {
    console.error('[SharedStateSync] Error:', err.message);
  }
  process.exit(0);
});
