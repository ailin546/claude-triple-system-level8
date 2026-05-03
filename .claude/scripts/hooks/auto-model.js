#!/usr/bin/env node
/**
 * PreToolUse(Agent) Hook — Auto Model Enforcement
 *
 * Intercepts Agent tool calls and enforces the correct model parameter
 * based on the current mode (Fast/Standard/Heavy) and agent category.
 *
 * Behavior:
 *   - Agent not in model-map (unknown): pass through silently (exit 0)
 *   - Model correct: pass through silently (exit 0)
 *   - Model missing or wrong: BLOCK (exit 2) with correction message
 *
 * stdin: JSON { tool_name, tool_input: { subagent_type, model, name, ... } }
 * stdout: error message on block
 * exit 0: allow | exit 2: block
 */

'use strict';

const { getModelForAgent, AGENT_CATEGORY } = require('../lib/model-map');
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
      // No agent name — pass through (generic agent)
      process.exit(0);
    }

    // Unknown agent (not in model-map) — pass through, don't block
    if (!AGENT_CATEGORY[agentName]) {
      process.exit(0);
    }

    const mode = getCurrentMode();
    const recommended = getModelForAgent(agentName);
    const current = (toolInput.model || '').toLowerCase().trim();

    if (current === recommended) {
      // Model is correct — pass through silently
      process.exit(0);
    }

    // Model missing or wrong — BLOCK with correction
    const reason = !current
      ? `no model set`
      : `model="${current}" doesn't match`;

    process.stderr.write(`[AutoModel] BLOCK: ${agentName} ${reason}, need "${recommended}" (mode: ${mode})\n`);
    process.stdout.write(
      `[AutoModel] BLOCKED: Agent "${agentName}" ${reason}.\n` +
      `Required: model="${recommended}" (mode: ${mode}).\n` +
      `Re-invoke the Agent tool with model="${recommended}".\n`
    );
    process.exit(2);
  } catch (err) {
    // Parse error — pass through (don't block on hook failure)
    process.stderr.write(`[AutoModel] hook error: ${err.message}\n`);
    process.exit(0);
  }
});
