#!/usr/bin/env node
/**
 * Freeze Guard — Edit Scope Lock
 *
 * PreToolUse hook for Edit/Write that restricts file modifications
 * to a designated directory during debugging sessions.
 *
 * Inspired by gstack's /freeze mechanism.
 *
 * Usage: /freeze <directory> to lock, /unfreeze to unlock.
 * State stored in .claude/.freeze-dir (contains absolute path with trailing slash).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const FREEZE_FILE = path.join(PROJECT_ROOT, '.claude', '.freeze-dir');

function getFreezeDir() {
  try {
    const dir = fs.readFileSync(FREEZE_FILE, 'utf8').trim();
    return dir || null;
  } catch {
    return null;
  }
}

function main() {
  const freezeDir = getFreezeDir();
  if (!freezeDir) {
    // No freeze active — allow all edits
    return;
  }

  // Read tool input from stdin
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    return;
  }

  let toolInput;
  try {
    toolInput = JSON.parse(input);
  } catch {
    return;
  }

  // Extract file path from Edit or Write tool input
  const filePath = toolInput.tool_input?.file_path || '';
  if (!filePath) return;

  // Resolve to absolute path
  const absPath = path.resolve(filePath);
  const absFreezeDir = path.resolve(freezeDir);

  // Check if the target file is within the frozen directory
  if (!absPath.startsWith(absFreezeDir)) {
    const result = {
      decision: 'block',
      reason: `[freeze-guard] Edit blocked: ${path.relative(PROJECT_ROOT, absPath)}\nEdits restricted to: ${path.relative(PROJECT_ROOT, absFreezeDir)}/\nRun /unfreeze to remove the restriction.`
    };
    process.stdout.write(JSON.stringify(result));
    return;
  }

  // File is within frozen directory — allow
}

main();
