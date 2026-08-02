#!/usr/bin/env node
/**
 * SessionStart Hook — Discord plugin auto-restore patch
 *
 * Background: claude-plugins-official/discord/<ver>/server.ts has a design
 * gap — discord.js v14 默认 IDENTIFY 不带 presence 字段, Discord 端不广播
 * online status → bot 头像永远显示为 offline (灰色), 即使 inbound/outbound
 * 都正常工作。
 *
 * Fix: 在 ready handler 加 `c.user.setPresence({status: 'online'})`.
 *
 * Plugin 是 vendored 文件, plugin update 会覆盖 patch. 本 hook 在每次
 * SessionStart 检查 patch 是否还在, 不在就 re-apply。
 *
 * 来源教训: ~/.claude/CLAUDE.md §错误教训日志 [2026-05-11]
 *
 * 优雅降级: 任何错误 silent log to stderr, never block session start.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_GLOB_DIR = path.join(
  os.homedir(),
  '.claude', 'plugins', 'cache', 'claude-plugins-official', 'discord'
);

// 精确匹配原始 ready handler 文本（3 行,无 setPresence)
// 必须用 split-string 避免 hook 文件自身被这个 hook 当成需要 patch 的目标
const SENTINEL_PIECES = ['set', 'Presence(', '{ status: \'online\' }', ')'];
const SENTINEL = SENTINEL_PIECES.join('');

const NEEDLE = [
  'client.once(\'ready\', c => {',
  '  process.stderr.write(`discord channel: gateway connected as ${c.user.tag}`',
];

// Replacement: inject setPresence 在 ready handler 内, 保留原 stderr.write
const PATCHED = `client.once('ready', c => {
  // discord.js v14 默认 IDENTIFY 不带 presence → Discord 端不广播 online → 灰头像。
  // 用户级 patch (~/.claude/scripts/hooks/discord-plugin-patch.js), auto-restore。
  c.user.${SENTINEL}
  process.stderr.write(\`discord channel: gateway connected as \${c.user.tag}\\n\`)
})`;

const ORIGINAL = `client.once('ready', c => {
  process.stderr.write(\`discord channel: gateway connected as \${c.user.tag}\\n\`)
})`;

function log(level, msg) {
  process.stderr.write(`[discord-plugin-patch:${level}] ${msg}\n`);
}

function findPluginVersionDirs() {
  if (!fs.existsSync(PLUGIN_GLOB_DIR)) return [];
  try {
    return fs.readdirSync(PLUGIN_GLOB_DIR)
      .map((v) => path.join(PLUGIN_GLOB_DIR, v))
      .filter((p) => fs.statSync(p).isDirectory());
  } catch (e) {
    log('warn', `cannot list ${PLUGIN_GLOB_DIR}: ${e.message}`);
    return [];
  }
}

function patchOne(dir) {
  const serverPath = path.join(dir, 'server.ts');
  if (!fs.existsSync(serverPath)) {
    log('skip', `no server.ts in ${dir}`);
    return { patched: false, reason: 'no-server-ts' };
  }

  let content;
  try {
    content = fs.readFileSync(serverPath, 'utf8');
  } catch (e) {
    log('warn', `read failed ${serverPath}: ${e.message}`);
    return { patched: false, reason: 'read-error' };
  }

  // Already patched
  if (content.includes(SENTINEL)) {
    return { patched: false, reason: 'already-patched', file: serverPath };
  }

  // Find original handler — accept slight whitespace variation
  if (!content.includes(ORIGINAL)) {
    log('skip', `${serverPath}: ready handler shape unrecognized, plugin upstream may have changed — skipping to avoid corrupting`);
    return { patched: false, reason: 'shape-unrecognized', file: serverPath };
  }

  // Make backup once (per version dir)
  const backupPath = serverPath + '.pre-presence-patch';
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(serverPath, backupPath);
    } catch (e) {
      log('warn', `backup failed ${backupPath}: ${e.message} — proceeding anyway`);
    }
  }

  // Apply
  const next = content.replace(ORIGINAL, PATCHED);
  if (next === content) {
    log('warn', `${serverPath}: replace produced no diff (unexpected)`);
    return { patched: false, reason: 'no-diff', file: serverPath };
  }

  try {
    fs.writeFileSync(serverPath, next, 'utf8');
    log('info', `patched ${serverPath}`);
    return { patched: true, file: serverPath };
  } catch (e) {
    log('warn', `write failed ${serverPath}: ${e.message}`);
    return { patched: false, reason: 'write-error', file: serverPath };
  }
}

function main() {
  // Drain stdin (SessionStart hooks receive JSON payload but we don't need it)
  let stdinData = '';
  try {
    if (process.stdin.isTTY) {
      // No stdin, fine
    } else {
      stdinData = fs.readFileSync(0, 'utf8');
    }
  } catch { /* ignore */ }

  const dirs = findPluginVersionDirs();
  if (dirs.length === 0) {
    // Discord plugin not installed → silent no-op
    process.exit(0);
  }

  let anyPatched = false;
  for (const d of dirs) {
    const r = patchOne(d);
    if (r.patched) anyPatched = true;
  }

  if (anyPatched) {
    // Note: 已有跑着的 bun server 不会重读 patched 文件;
    // 下次 listener 重启 / bun server respawn 才生效。
    log('info', 'patch applied — restart `discord-bot` tmux session to take effect on running bot');
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  log('error', `unexpected: ${e.message}`);
  process.exit(0); // Never block session start
}
