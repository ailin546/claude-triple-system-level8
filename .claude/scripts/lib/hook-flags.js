#!/usr/bin/env node
/**
 * Hook flag/profile system for ECC.
 *
 * Controls which hooks are enabled based on active profiles.
 * Profiles are set via:
 *   - ECC_HOOK_PROFILES env var (comma-separated)
 *   - .claude/hook-profiles.json file
 *   - CLI argument passed to run-with-flags.js
 *
 * If no profiles are configured, all hooks are enabled by default.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load active profiles from environment and config.
 *
 * @returns {Set<string>} Active profile names
 */
function getActiveProfiles() {
  const profiles = new Set();

  // From environment variable
  const envProfiles = process.env.ECC_HOOK_PROFILES;
  if (envProfiles) {
    envProfiles.split(',').map(p => p.trim()).filter(Boolean).forEach(p => profiles.add(p));
  }

  // From project config file
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const configPath = path.join(projectRoot, '.claude', 'hook-profiles.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.active)) {
      config.active.filter(p => typeof p === 'string').forEach(p => profiles.add(p));
    }
  } catch {
    // No config file or invalid JSON — that's fine
  }

  return profiles;
}

/**
 * Load hook-to-profile mapping.
 *
 * Mapping file: .claude/hook-flags.json
 * Format: { "hookId": ["profile1", "profile2"], ... }
 *
 * If a hook is not listed, it is enabled by default.
 *
 * @returns {Object<string, string[]>} Hook ID to required profiles
 */
function getHookProfileMap() {
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const mapPath = path.join(projectRoot, '.claude', 'hook-flags.json');
  try {
    return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Check if a specific hook is enabled based on active profiles.
 *
 * Rules:
 * - If no hook-flags.json exists, all hooks are enabled
 * - If hook is not listed in hook-flags.json, it is enabled
 * - If hook is listed, at least one of its profiles must be active
 * - Special profile "*" means always enabled
 *
 * @param {string} hookId - Hook identifier (e.g., "post-edit-format")
 * @param {{ profiles?: string }} [options] - Optional CSV profiles override
 * @returns {boolean}
 */
function isHookEnabled(hookId, options) {
  if (!hookId) return true;

  const hookMap = getHookProfileMap();
  const requiredProfiles = hookMap[hookId];

  // Not listed in map — enabled by default
  if (!requiredProfiles || !Array.isArray(requiredProfiles) || requiredProfiles.length === 0) {
    return true;
  }

  // Wildcard — always enabled
  if (requiredProfiles.includes('*')) {
    return true;
  }

  // Merge active profiles from all sources
  const active = getActiveProfiles();

  // Also merge CLI-passed profiles
  if (options && options.profiles) {
    options.profiles.split(',').map(p => p.trim()).filter(Boolean).forEach(p => active.add(p));
  }

  // If no profiles are active at all, enable everything (permissive default)
  if (active.size === 0) {
    return true;
  }

  // Check if any required profile is active
  return requiredProfiles.some(p => active.has(p));
}

module.exports = {
  isHookEnabled,
  getActiveProfiles,
  getHookProfileMap,
};
