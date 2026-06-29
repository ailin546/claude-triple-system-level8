#!/usr/bin/env node
/**
 * PostToolUse Hook: Fault Scenario Hint
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after Edit/Write tool use. Scans the edited file for patterns
 * that indicate error handling, external dependencies, or resilience
 * logic. When detected, emits a reminder to run `/verify fault` via
 * additionalContext (visible to the model — plain stdout/stderr on a
 * PostToolUse exit-0 hook is NOT, see lib/hook-output.js).
 *
 * Lightweight by design — reads only the edited file, no spawns.
 */

'use strict';

// ── Mode gate: Standard+ only ───────────────────────────────
const { requireMode } = require('../lib/mode-check');
if (!requireMode('standard')) {
  // Fast mode — drain stdin and exit silently (no passthrough: stdout is
  // reserved for the additionalContext JSON envelope).
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => process.exit(0));
  return;
}
// ─────────────────────────────────────────────────────────────

const { readFile } = require('../lib/utils');
const { emitAdditionalContext } = require('../lib/hook-output');

const MAX_STDIN = 1024 * 1024; // 1MB limit

/**
 * Fault-relevant patterns grouped by category.
 * Each category has a label and an array of regex patterns.
 */
const FAULT_PATTERNS = [
  {
    category: 'error-handling',
    label: '错误处理逻辑',
    patterns: [
      /\bcatch\s*\(/,
      /\.catch\s*\(/,
      /\bonError\b/,
      /\bonRejected\b/,
      /\.on\(\s*['"]error['"]/,
    ],
  },
  {
    category: 'external-calls',
    label: '外部依赖调用',
    patterns: [
      /\bfetch\s*\(/,
      /\baxios\b/,
      /\bhttp\.(get|post|put|delete|request)\b/,
      /\bgot\s*\(/,
      /\bky\s*\./,
      /new\s+URL\s*\(/,
    ],
  },
  {
    category: 'database',
    label: '数据库操作',
    patterns: [
      /\b(query|execute)\s*\(/,
      /\btransaction\s*\(/,
      /\bconnect\s*\(/,
      /\bprisma\b/,
      /\bdrizzle\b/,
      /\bknex\b/,
      /\bsequelize\b/,
      /\bmongoose\b/,
    ],
  },
  {
    category: 'resilience',
    label: '韧性模式',
    patterns: [
      /\bretry\b/i,
      /\btimeout\b/i,
      /\bcircuit\s*breaker\b/i,
      /\bfallback\b/i,
      /\bbackoff\b/i,
    ],
  },
];

/**
 * File extensions worth scanning for fault patterns.
 */
const SCANNABLE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb)$/;

/**
 * Paths to skip (test files, config, generated).
 */
const SKIP_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
  /node_modules\//,
  /\.config\.[jt]s$/,
  /\.d\.ts$/,
];

let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = String(input.tool_input?.file_path || '');

    if (!filePath || !SCANNABLE_EXTENSIONS.test(filePath)) process.exit(0);
    if (SKIP_PATTERNS.some(p => p.test(filePath))) process.exit(0);

    const content = readFile(filePath);
    if (!content) process.exit(0);

    const detected = [];

    for (const group of FAULT_PATTERNS) {
      for (const pattern of group.patterns) {
        if (pattern.test(content)) {
          detected.push(group.label);
          break; // one match per category is enough
        }
      }
    }

    if (detected.length > 0) {
      emitAdditionalContext(
        `[fault-hint] 检测到: ${detected.join('、')} → 建议运行 /verify fault 验证故障场景`
      );
    }
  } catch {
    // Invalid input — no-op
  }

  process.exit(0);
});
