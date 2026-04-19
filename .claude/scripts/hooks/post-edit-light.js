#!/usr/bin/env node
/**
 * PostToolUse Hook: Lightweight post-edit checks (Always-on)
 *
 * Combines:
 * - Auto-format (delegates to post-edit-format.js logic)
 * - console.log warning (from post-edit-console-warn.js)
 * - Lightweight risk keyword scan
 *
 * Replaces separate post-edit-format.js + post-edit-console-warn.js
 * in the default hook chain. Fails silently — never blocks.
 *
 * Cross-platform (Windows, macOS, Linux)
 */

'use strict';

const path = require('path');
const { readFile, log } = require('../lib/utils');

// Risk keywords that suggest the file may need careful review
const RISK_KEYWORDS = [
  'password', 'secret', 'token', 'api_key', 'apikey', 'api-key',
  'private_key', 'credential', 'DELETE FROM', 'DROP TABLE',
  'rm -rf', 'force push', '--force',
];

const MAX_STDIN = 1024 * 1024;

/**
 * Core logic — runs format + console.log check + risk scan.
 */
function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path;
    if (!filePath) return rawInput;

    // ── 1. Auto-format (delegate to existing formatter) ──
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      try {
        const formatter = require('./post-edit-format.js');
        if (typeof formatter.run === 'function') {
          formatter.run(rawInput);
        }
      } catch {
        // Formatter not available — non-blocking
      }
    }

    // ── 2. Read file once for all checks ──
    const content = readFile(filePath);

    // ── 3. console.log warning ──
    if (/\.(ts|tsx|js|jsx)$/.test(filePath) && content) {
      const lines = content.split('\n');
      const matches = [];
      lines.forEach((line, idx) => {
        if (/console\.log/.test(line)) {
          matches.push((idx + 1) + ': ' + line.trim());
        }
      });
      if (matches.length > 0) {
        log(`[PostEditLight] console.log found in ${filePath}`);
        matches.slice(0, 3).forEach(m => log(`  ${m}`));
      }
    }

    // ── 4. Risk keyword scan ──
    if (content) {
      const foundRisks = RISK_KEYWORDS.filter(kw =>
        content.toLowerCase().includes(kw.toLowerCase())
      );
      if (foundRisks.length > 0) {
        log(`[PostEditLight] Risk keywords in ${filePath}: ${foundRisks.join(', ')}`);
      }
    }

    // ── 5. External exchange API URL detection ──
    // Bottom-layer engines already receive market data via WS. Front-end
    // should read from SharedState / Dashboard API, NOT call exchanges directly.
    if (content && /\.(ts|tsx|js|jsx)$/.test(filePath)) {
      const EXCHANGE_URLS = [
        'api.binance.com', 'fapi.binance.com',
        'www.okx.com', 'api.bybit.com',
        'api.bitget.com', 'api.gateio.ws',
        'api.huobi.pro', 'api.hbdm.com',
        'api-futures.kucoin.com', 'api.kucoin.com',
        'contract.mexc.com', 'api.hyperliquid.xyz',
      ];
      const found = EXCHANGE_URLS.filter(u => content.includes(u));
      if (found.length > 0) {
        log(`⚠️ [PostEditLight] 检测到直接调用外部交易所 API: ${found.join(', ')}`);
        log(`   底层 Engine 已实时接收行情数据。请确认是否可以复用 SharedState / Dashboard API。`);
        log(`   参见 CLAUDE.md §3.5 数据获取规则 + docs/FEATURE_STATUS.md §1 数据源 SSOT 表。`);
      }
    }

    // ── 5b. Vite proxy route detection ──
    // /proxy-* routes forward to exchanges — same SSOT violation as direct calls.
    if (content && /.(ts|tsx|js|jsx)$/.test(filePath)) {
      const PROXY_PATTERNS = [
        '/proxy-binance', '/proxy-okx', '/proxy-bybit',
        '/proxy-gate', '/proxy-bitget', '/proxy-mexc',
        '/proxy-kucoin', '/proxy-coinex', '/proxy-hyperliquid',
      ];
      const found = PROXY_PATTERNS.filter(p => content.includes(p));
      if (found.length > 0) {
        log(`⚠️ [PostEditLight] 检测到通过 vite proxy 调用交易所 API: ${found.join(', ')}`);
        log(`   底层 Engine 已实时接收行情数据。请确认是否可以复用 Master API / SharedState。`);
        log(`   参见 CLAUDE.md §八½ 不变量 #1: 每个数据字段只有一个源头。`);
      }
    }

    // ── 6. Fire-and-forget pattern detection ──
    // Layer calls must have response paths (invariant #2)
    if (content && /\.(rs)$/.test(filePath)) {
      // Detect send() without checking result in Rust
      const fireForgetPatterns = [
        /let\s+_\s*=\s*.*\.send\(/,   // let _ = tx.send(...)
        /let\s+_\s*=\s*.*\.try_send\(/, // let _ = tx.try_send(...)
      ];
      const ffMatches = fireForgetPatterns.filter(p => p.test(content));
      if (ffMatches.length > 0) {
        log(`⚠️ [PostEditLight] 检测到可能的 fire-and-forget 模式（${filePath}）`);
        log(`   层间调用必须有响应路径。参见 CLAUDE.md §八½ 不变量 #2。`);
      }
    }

    // ── 7. Hardcoded default value detection ──
    // Defaults must be production-safe (invariant #3)
    if (content && /\.(rs)$/.test(filePath)) {
      const unsafeDefaults = [
        { pattern: /default.*25000/i, msg: 'hardcoded 25000 (initial_usdt?)' },
        { pattern: /default.*0\.36/i, msg: 'hardcoded 0.36 (initial_btc?)' },
      ];
      for (const { pattern, msg } of unsafeDefaults) {
        if (pattern.test(content)) {
          log(`⚠️ [PostEditLight] 检测到硬编码默认值: ${msg}（${filePath}）`);
          log(`   默认值必须安全。参见 CLAUDE.md §八½ 不变量 #3。`);
        }
      }
    }

    // ── 8. Hardcoded exchange list detection ──
    // User options must be backed by system capability (invariant #4)
    if (content && /\.(ts|tsx)$/.test(filePath)) {
      if (/EXCHANGE_NAMES\s*=\s*\[/.test(content) || /const\s+EXCHANGES\s*=\s*\[/.test(content)) {
        log(`⚠️ [PostEditLight] 检测到硬编码交易所列表（${filePath}）`);
        log(`   交易所列表应从 API 动态获取。参见 CLAUDE.md §八½ 不变量 #4。`);
      }
    }

    // Note: Mode auto-escalation is handled by pre-tool-escalate.js (SSOT)
  } catch {
    // Invalid input — pass through silently
  }

  return rawInput;
}

// ── stdin entry point ────────────────────────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    data = run(data);
    process.stdout.write(data);
    process.exit(0);
  });
}

module.exports = { run };
