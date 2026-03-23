#!/usr/bin/env node
/**
 * Fault Scenario Verifier
 *
 * Scans git-modified source files for common fault-handling gaps:
 *
 *   1. Empty catch blocks (swallowed errors)
 *   2. Fetch/HTTP calls without timeout
 *   3. Database calls without error handling
 *   4. Missing input validation at API boundaries
 *   5. Promises without .catch or try/await
 *
 * Usage:
 *   node fault-scenarios.js            # scan git-modified files
 *   node fault-scenarios.js --all      # scan all source files in project
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — issues found (printed to stdout as JSON)
 *
 * Output format (JSON):
 *   { summary: { total, critical, high, medium }, issues: [...] }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, getGitModifiedFiles, readFile, log } = require('../lib/utils');
const { execFileSync } = require('child_process');

// ── Configuration ────────────────────────────────────────────

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.rb'];

const SKIP_PATTERNS = [
  /node_modules\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
  /\.d\.ts$/,
  /\.config\.[jt]s$/,
  /\.min\.js$/,
  /dist\//,
  /build\//,
  /\.claude\//,
];

// ── Checkers ─────────────────────────────────────────────────

/**
 * Each checker receives file content + path, returns an array of issues.
 * Issue shape: { rule, severity, file, line, message }
 */

function checkEmptyCatch(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // JS/TS: catch block with empty body or only a comment
    if (/\bcatch\s*\(/.test(line)) {
      // Look ahead up to 3 lines for the closing brace
      const block = lines.slice(i, i + 4).join('\n');
      if (/catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/.test(block)) {
        issues.push({
          rule: 'empty-catch',
          severity: 'critical',
          file: filePath,
          line: i + 1,
          message: 'catch 块为空 — 错误被静默吞没，应记录或重新抛出',
        });
      }
    }

    // .catch(() => {}) or .catch(e => {})
    if (/\.catch\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$]+)\s*=>\s*\{\s*\}\s*\)/.test(line)) {
      issues.push({
        rule: 'empty-catch',
        severity: 'critical',
        file: filePath,
        line: i + 1,
        message: '.catch() 回调为空 — Promise 错误被静默吞没',
      });
    }
  }

  return issues;
}

function checkFetchWithoutTimeout(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fetch() call without signal or timeout in surrounding context
    if (/\bfetch\s*\(/.test(line) && !/\bsignal\b/.test(line)) {
      // Check surrounding 5 lines for AbortController / signal / timeout
      const context = lines.slice(Math.max(0, i - 5), i + 5).join('\n');
      if (!/AbortController|signal|timeout/i.test(context)) {
        issues.push({
          rule: 'fetch-no-timeout',
          severity: 'high',
          file: filePath,
          line: i + 1,
          message: 'fetch() 未设置 timeout/AbortSignal — 网络故障时将无限挂起',
        });
      }
    }

    // axios without timeout config
    if (/\baxios\.(get|post|put|patch|delete|request)\s*\(/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), i + 5).join('\n');
      if (!/timeout\s*:/i.test(context)) {
        issues.push({
          rule: 'http-no-timeout',
          severity: 'high',
          file: filePath,
          line: i + 1,
          message: 'axios 请求未设置 timeout — 外部服务无响应时将挂起',
        });
      }
    }
  }

  return issues;
}

function checkDbWithoutErrorHandling(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  const dbCallPatterns = [
    /\.\s*query\s*\(/,
    /\.\s*execute\s*\(/,
    /\.\s*raw\s*\(/,
    /\bprisma\.[a-zA-Z]+\.(find|create|update|delete|upsert)\b/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of dbCallPatterns) {
      if (pattern.test(line)) {
        // Check if wrapped in try/catch or has .catch
        const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join('\n');
        if (!/\btry\s*\{/.test(context) && !/\.catch\s*\(/.test(context)) {
          issues.push({
            rule: 'db-no-error-handling',
            severity: 'high',
            file: filePath,
            line: i + 1,
            message: '数据库操作未包裹在 try/catch 中 — 连接失败时将抛出未处理异常',
          });
          break; // one per db-call cluster is enough
        }
      }
    }
  }

  return issues;
}

function checkMissingInputValidation(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  // Detect API route handlers (Express, Fastify, Next.js, etc.)
  const routePatterns = [
    /\.(get|post|put|patch|delete)\s*\(\s*['"`]/,       // express: app.get('/...')
    /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/, // Next.js App Router
    /export\s+default\s+async\s+function\s+handler\b/,  // Next.js Pages API
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of routePatterns) {
      if (pattern.test(line)) {
        // Look ahead 15 lines for validation indicators
        const body = lines.slice(i, Math.min(lines.length, i + 20)).join('\n');
        const hasValidation = /\b(zod|joi|yup|validate|schema|parse|safeParse|check|assert)\b/i.test(body)
          || /req\.(params|query|body)\s*\?\.\s*/.test(body)
          || /typeof\s+/.test(body);

        if (!hasValidation) {
          issues.push({
            rule: 'api-no-validation',
            severity: 'medium',
            file: filePath,
            line: i + 1,
            message: 'API 端点未检测到输入验证 — 应在系统边界校验所有外部输入',
          });
        }
        break; // one per handler region
      }
    }
  }

  return issues;
}

function checkUnhandledPromise(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detects: someAsyncFn() without await and without .then/.catch
    // Heuristic: line ends with (); and no await/return/.then/.catch
    if (/^[a-zA-Z_$][\w$.]*\([^)]*\)\s*;?\s*$/.test(line)
        && !/^(await|return)\s/.test(line)
        && !/\.(then|catch|finally)\s*\(/.test(line)) {
      // Check if the function is likely async by looking for its definition
      const funcName = line.match(/^([a-zA-Z_$][\w$.]*)\(/)?.[1];
      if (funcName) {
        const defPattern = new RegExp(`async\\s+(function\\s+)?${funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (defPattern.test(content)) {
          issues.push({
            rule: 'unhandled-promise',
            severity: 'medium',
            file: filePath,
            line: i + 1,
            message: `调用 ${funcName}() 未 await 也未 .catch — 异步错误将丢失`,
          });
        }
      }
    }
  }

  return issues;
}

// ── All checkers ─────────────────────────────────────────────

const ALL_CHECKERS = [
  checkEmptyCatch,
  checkFetchWithoutTimeout,
  checkDbWithoutErrorHandling,
  checkMissingInputValidation,
  checkUnhandledPromise,
];

// ── File collection ──────────────────────────────────────────

function getAllSourceFiles(rootDir) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

function getTargetFiles(scanAll) {
  if (scanAll) {
    return getAllSourceFiles(getProjectRoot());
  }

  const extPatterns = SOURCE_EXTENSIONS.map(ext => `\\${ext}$`);
  return getGitModifiedFiles(extPatterns);
}

// ── Main ─────────────────────────────────────────────────────

function run(scanAll) {
  const files = getTargetFiles(scanAll)
    .filter(f => fs.existsSync(f))
    .filter(f => !SKIP_PATTERNS.some(p => p.test(f)));

  const allIssues = [];

  for (const filePath of files) {
    const content = readFile(filePath);
    if (!content) continue;

    for (const checker of ALL_CHECKERS) {
      const issues = checker(content, filePath);
      allIssues.push(...issues);
    }
  }

  // Sort: critical first, then high, then medium
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allIssues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  const summary = {
    files_scanned: files.length,
    total: allIssues.length,
    critical: allIssues.filter(i => i.severity === 'critical').length,
    high: allIssues.filter(i => i.severity === 'high').length,
    medium: allIssues.filter(i => i.severity === 'medium').length,
  };

  return { summary, issues: allIssues };
}

// ── CLI entry point ──────────────────────────────────────────

if (require.main === module) {
  const scanAll = process.argv.includes('--all');
  const result = run(scanAll);

  if (result.summary.total === 0) {
    log('[fault-scenarios] ✅ 未发现故障处理缺陷');
    process.exit(0);
  }

  // Print human-readable report
  log('');
  log('━━━ 故障场景验证报告 ━━━');
  log(`扫描文件: ${result.summary.files_scanned}`);
  log(`问题总数: ${result.summary.total} (CRITICAL: ${result.summary.critical}, HIGH: ${result.summary.high}, MEDIUM: ${result.summary.medium})`);
  log('');

  for (const issue of result.issues) {
    const tag = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡';
    const relPath = path.relative(getProjectRoot(), issue.file);
    log(`${tag} [${issue.severity.toUpperCase()}] ${relPath}:${issue.line}`);
    log(`   规则: ${issue.rule}`);
    log(`   ${issue.message}`);
    log('');
  }

  // Also output JSON to stdout for programmatic consumption
  process.stdout.write(JSON.stringify(result, null, 2));
  process.exit(1);
}

module.exports = { run };
