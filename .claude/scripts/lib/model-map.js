#!/usr/bin/env node
/**
 * Model mapping based on system mode (Fast/Standard/Heavy).
 *
 * Maps (agent-name, current-mode) → recommended model (haiku/sonnet/opus).
 *
 * Design principles:
 *   - Fast:     cost-efficient, Opus for critical reasoning only
 *   - Standard: balanced, Opus for reasoning + review
 *   - Heavy:    max capability, Opus on critical path, Sonnet for workers
 *
 * Usage:
 *   const { getModelForAgent, getAllModelAssignments } = require('./model-map');
 *   const model = getModelForAgent('planner');       // reads .task-mode
 *   const all   = getAllModelAssignments();           // full table
 *
 * Override: set MODEL_MAP_OVERRIDE=<agent>:<model>,<agent>:<model>
 *   e.g. MODEL_MAP_OVERRIDE=planner:sonnet,doc-updater:opus
 */

'use strict';

const { getCurrentMode } = require('./mode-check');

// ── Agent categories ────────────────────────────────────────

/**
 * Each category maps to a [fast, standard, heavy] model tuple.
 */
const CATEGORY_MODELS = {
  'critical-reasoning': ['opus',   'opus',   'opus'  ],
  'orchestrator':       ['sonnet', 'opus',   'opus'  ],
  'review':             ['sonnet', 'opus',   'opus'  ],
  'development':        ['sonnet', 'sonnet', 'opus'  ],
  'worker':             ['haiku',  'sonnet', 'sonnet'],
};

/**
 * Map agent names (as used in Agent tool or frontmatter) to categories.
 * Names are normalized to lowercase for matching.
 */
const AGENT_CATEGORY = {
  // critical-reasoning
  'planner':                    'critical-reasoning',
  'ecc-planner':                'critical-reasoning',
  'architect':                  'critical-reasoning',
  'ecc-architect':              'critical-reasoning',
  'engineering-software-architect': 'critical-reasoning',

  // orchestrator
  'agents-orchestrator':        'orchestrator',
  'agents orchestrator':        'orchestrator',

  // review
  'code-reviewer':              'review',
  'superpowers-code-reviewer':  'review',
  'engineering-code-reviewer':  'review',
  'security-reviewer':          'review',
  'ecc-security-reviewer':      'review',
  'engineering-security-engineer': 'review',

  // development
  'tdd-guide':                  'development',
  'ecc-tdd-guide':              'development',
  'build-error-resolver':       'development',
  'ecc-build-error-resolver':   'development',
  'engineering-frontend-developer':  'development',
  'engineering-backend-architect':   'development',
  'engineering-ai-engineer':         'development',
  'engineering-rapid-prototyper':    'development',
  'engineering-database-optimizer':  'development',
  'ecc-database-reviewer':          'development',
  'testing-api-tester':             'development',
  'testing-performance-benchmarker': 'development',
  'testing-evidence-collector':      'development',
  'testing-reality-checker':         'development',

  // worker
  'doc-updater':                'worker',
  'ecc-doc-updater':            'worker',
  'refactor-cleaner':           'worker',
  'ecc-refactor-cleaner':       'worker',
  'e2e-runner':                 'worker',
  'ecc-e2e-runner':             'worker',
  'engineering-git-workflow-master': 'worker',
  'engineering-technical-writer':    'worker',
  'engineering-devops-automator':    'worker',
};

// ── Mode index ──────────────────────────────────────────────

const MODE_INDEX = { fast: 0, standard: 1, heavy: 2 };

// ── User overrides ──────────────────────────────────────────

/**
 * Parse MODEL_MAP_OVERRIDE env var.
 * Format: "agent:model,agent:model"
 * @returns {Record<string, string>}
 */
function parseOverrides() {
  const raw = process.env.MODEL_MAP_OVERRIDE || '';
  if (!raw.trim()) return {};
  const overrides = {};
  for (const pair of raw.split(',')) {
    const [agent, model] = pair.split(':').map(s => s.trim().toLowerCase());
    if (agent && model && ['haiku', 'sonnet', 'opus'].includes(model)) {
      overrides[agent] = model;
    }
  }
  return overrides;
}

// ── Public API ──────────────────────────────────────────────

const DEFAULT_MODEL = 'sonnet';

/**
 * Get the recommended model for a given agent name under the current mode.
 *
 * @param {string} agentName - Agent name (case-insensitive)
 * @param {{ mode?: string }} [opts] - Optional mode override for testing
 * @returns {'haiku' | 'sonnet' | 'opus'}
 */
function getModelForAgent(agentName, opts = {}) {
  const mode = opts.mode || getCurrentMode();
  const modeIdx = MODE_INDEX[mode] ?? 0;
  const key = (agentName || '').toLowerCase().trim();

  // Check user override first
  const overrides = parseOverrides();
  if (overrides[key]) return overrides[key];

  // Look up category
  const category = AGENT_CATEGORY[key];
  if (!category) return DEFAULT_MODEL;

  const models = CATEGORY_MODELS[category];
  if (!models) return DEFAULT_MODEL;

  return models[modeIdx] || DEFAULT_MODEL;
}

/**
 * Get all model assignments for the current mode.
 *
 * @param {{ mode?: string }} [opts] - Optional mode override
 * @returns {Array<{ agent: string, category: string, model: string }>}
 */
function getAllModelAssignments(opts = {}) {
  const mode = opts.mode || getCurrentMode();
  const modeIdx = MODE_INDEX[mode] ?? 0;
  const overrides = parseOverrides();
  const seen = new Set();
  const result = [];

  for (const [agent, category] of Object.entries(AGENT_CATEGORY)) {
    if (seen.has(agent)) continue;
    seen.add(agent);

    let model;
    if (overrides[agent]) {
      model = overrides[agent];
    } else {
      const models = CATEGORY_MODELS[category];
      model = models ? (models[modeIdx] || DEFAULT_MODEL) : DEFAULT_MODEL;
    }

    result.push({ agent, category, model });
  }

  return result;
}

/**
 * Get a compact summary string for logging.
 *
 * @param {{ mode?: string }} [opts]
 * @returns {string}
 */
function getModelSummary(opts = {}) {
  const mode = opts.mode || getCurrentMode();
  const modeIdx = MODE_INDEX[mode] ?? 0;
  const lines = [`Model assignments (mode: ${mode}):`];

  for (const [category, models] of Object.entries(CATEGORY_MODELS)) {
    lines.push(`  ${category}: ${models[modeIdx]}`);
  }

  return lines.join('\n');
}

module.exports = {
  getModelForAgent,
  getAllModelAssignments,
  getModelSummary,
  CATEGORY_MODELS,
  AGENT_CATEGORY,
  DEFAULT_MODEL,
};
