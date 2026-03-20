#!/usr/bin/env node
/**
 * Formatter detection and resolution for JS/TS projects.
 *
 * Detects whether a project uses Biome or Prettier by looking for
 * config files, then resolves the binary path (preferring local
 * node_modules/.bin over global/npx).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Config files that indicate which formatter is used
const BIOME_CONFIGS = ['biome.json', 'biome.jsonc'];
const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

/**
 * Walk up from `startDir` to find the project root (directory containing
 * package.json or .git).
 *
 * @param {string} startDir - Directory to start searching from
 * @returns {string} Project root path, or startDir if not found
 */
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);

  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return startDir;
}

/**
 * Detect which formatter a project uses.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {'biome'|'prettier'|null} Detected formatter or null
 */
function detectFormatter(projectRoot) {
  // Check Biome first (newer, faster)
  for (const config of BIOME_CONFIGS) {
    if (fs.existsSync(path.join(projectRoot, config))) {
      return 'biome';
    }
  }

  // Check Prettier
  for (const config of PRETTIER_CONFIGS) {
    if (fs.existsSync(path.join(projectRoot, config))) {
      return 'prettier';
    }
  }

  // Check package.json for prettier key
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    );
    if (pkg.prettier) return 'prettier';
  } catch {
    // no package.json or invalid JSON
  }

  return null;
}

/**
 * Resolve the binary path for a formatter.
 *
 * Prefers local node_modules/.bin over npx to avoid ~200-500ms
 * package-resolution overhead per invocation.
 *
 * @param {string} projectRoot - Project root directory
 * @param {'biome'|'prettier'} formatter - Formatter name
 * @returns {{ bin: string, prefix: string[] }|null} Binary info or null
 */
function resolveFormatterBin(projectRoot, formatter) {
  const binName = formatter === 'biome' ? 'biome' : 'prettier';

  // Try local node_modules/.bin first
  const localBin = path.join(projectRoot, 'node_modules', '.bin', binName);
  if (fs.existsSync(localBin)) {
    return { bin: localBin, prefix: [] };
  }

  // Windows: check .cmd variant
  if (process.platform === 'win32') {
    const cmdBin = localBin + '.cmd';
    if (fs.existsSync(cmdBin)) {
      return { bin: cmdBin, prefix: [] };
    }
  }

  // Fallback: try npx
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return { bin: npxBin, prefix: [binName] };
}

module.exports = {
  findProjectRoot,
  detectFormatter,
  resolveFormatterBin,
};
