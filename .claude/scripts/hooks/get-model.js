#!/usr/bin/env node
/**
 * CLI utility to query the recommended model for an agent.
 *
 * Usage:
 *   node .claude/scripts/hooks/get-model.js <agent-name>   # single agent
 *   node .claude/scripts/hooks/get-model.js --all           # all agents
 *   node .claude/scripts/hooks/get-model.js --summary       # category summary
 *
 * Output goes to stdout (machine-readable).
 * Diagnostics go to stderr.
 *
 * Exit codes:
 *   0 — success
 *   1 — missing argument
 */

'use strict';

const { getModelForAgent, getAllModelAssignments, getModelSummary } = require('../lib/model-map');
const { getCurrentMode } = require('../lib/mode-check');

const args = process.argv.slice(2).map(a => a.toLowerCase().trim());

if (args.includes('--all')) {
  const mode = getCurrentMode();
  const assignments = getAllModelAssignments();
  console.error(`[GetModel] Mode: ${mode}`);

  // Group by category for readable output
  const grouped = {};
  for (const { agent, category, model } of assignments) {
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ agent, model });
  }

  for (const [category, agents] of Object.entries(grouped)) {
    console.log(`\n[${category}]`);
    for (const { agent, model } of agents) {
      console.log(`  ${agent}: ${model}`);
    }
  }
  process.exit(0);
}

if (args.includes('--summary')) {
  console.log(getModelSummary());
  process.exit(0);
}

const agentName = args.find(a => !a.startsWith('--'));

if (!agentName) {
  console.error('[GetModel] Usage: get-model.js <agent-name> | --all | --summary');
  console.error(`[GetModel] Current mode: ${getCurrentMode()}`);
  process.exit(1);
}

const model = getModelForAgent(agentName);
const mode = getCurrentMode();
console.log(model);
console.error(`[GetModel] ${agentName} → ${model} (mode: ${mode})`);
process.exit(0);
