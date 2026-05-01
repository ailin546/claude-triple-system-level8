#!/usr/bin/env node
/**
 * SessionStart hook — codex-plugin-cc presence check.
 *
 * Project mandate: all Codex calls go through the official codex-plugin-cc
 * plugin (see .claude/commands/codex.md). If the plugin is not installed yet
 * on this machine, print a one-time install reminder so the next session can
 * surface it to the user.
 *
 * Output goes to stdout → injected into Claude's context. Stays silent once
 * the plugin is installed. Always exits 0 (graceful degradation).
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_KEY = 'codex@openai-codex';
const HOME = process.env.HOME || process.env.USERPROFILE;

if (!HOME) {
  // No home dir we can resolve — silently skip
  process.exit(0);
}

const installedPath = path.join(HOME, '.claude', 'plugins', 'installed_plugins.json');

function isPluginInstalled() {
  try {
    const data = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
    return Boolean(data && data.plugins && data.plugins[PLUGIN_KEY]);
  } catch {
    return false;
  }
}

if (!isPluginInstalled()) {
  process.stdout.write(
    '[codex-plugin] codex-plugin-cc 未安装。要启用 /codex:* 跨 AI 审查命令，请运行一次：\n' +
    '  /plugin marketplace add openai/codex-plugin-cc\n' +
    '  /plugin install codex@openai-codex\n' +
    '  /reload-plugins\n' +
    '  /codex:setup\n'
  );
}

process.exit(0);
