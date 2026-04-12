#!/usr/bin/env node
/**
 * PreToolUse(Agent) Hook — Auto Model Selection
 *
 * Intercepts Agent tool calls, checks if the model parameter matches
 * the recommended model for the current mode, and outputs a correction
 * hint to stdout (injected into Claude's context).
 *
 * If model is already correct or agent is unknown, passes through silently.
 *
 * stdin: JSON { tool_name, tool_input: { subagent_type, model, name, ... } }
 * stdout: hint message (if model needs correction) or passthrough
 * exit 0: always allow (never blocks)
 */

'use strict';

const { getModelForAgent } = require('../lib/model-map');
const { getCurrentMode } = require('../lib/mode-check');

const MAX_STDIN = 64 * 1024;
let stdinData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(stdinData);
    const toolInput = input.tool_input || {};

    // Extract agent name from subagent_type or name
    const agentName = (toolInput.subagent_type || toolInput.name || '').toLowerCase().trim();
    if (!agentName) {
      process.stdout.write(stdinData);
      process.exit(0);
    }

    const mode = getCurrentMode();
    const recommended = getModelForAgent(agentName);
    const current = (toolInput.model || '').toLowerCase().trim();

    if (!current) {
      // No model specified — output hint
      process.stderr.write(`[AutoModel] ${agentName} → ${recommended} (mode: ${mode})\n`);
      process.stdout.write(`[AutoModel] Agent "${agentName}" has no model set. Recommended: model="${recommended}" (mode: ${mode}). Set the model parameter.\n`);
    } else if (current !== recommended) {
      // Model specified but doesn't match recommendation
      process.stderr.write(`[AutoModel] ${agentName}: ${current} → ${recommended} (mode: ${mode})\n`);
      process.stdout.write(`[AutoModel] Agent "${agentName}" model="${current}" doesn't match recommendation "${recommended}" for ${mode} mode. Consider using model="${recommended}".\n`);
    } else {
      // Model is correct, pass through silently
      process.stdout.write(stdinData);
    }
  } catch {
    // Parse error — pass through
    process.stdout.write(stdinData);
  }
  process.exit(0);
});
