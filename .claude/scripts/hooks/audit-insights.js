#!/usr/bin/env node
/**
 * Audit Insights Generator (Stop hook, Standard+)
 *
 * Analyzes accumulated audit data (mode-trace, hook-effectiveness, memory access)
 * and generates daily insights reports. Also produces threshold tuning suggestions
 * and memory staleness analysis.
 *
 * Runs at most once per day (lock file throttled).
 * Output: .claude/logs/insights-YYYY-MM-DD.md
 *
 * Non-blocking: errors never prevent session exit.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Mode gate: Standard+ only ───────────────────────────────
const { requireMode, MODE_TRACE_PATH } = require('../lib/mode-check');
if (!requireMode('standard')) {
  const MAX = 1024 * 1024;
  let d = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => {
    if (d.length < MAX) d += c.substring(0, Math.min(c.length, MAX - d.length));
  });
  process.stdin.on('end', () => { process.stdout.write(d); process.exit(0); });
  return;
}
// ─────────────────────────────────────────────────────────────

const { getProjectRoot } = require('../lib/project-root');
const PROJECT_ROOT = getProjectRoot();
const LOGS_DIR = path.join(PROJECT_ROOT, '.claude', 'logs');
const LOCK_FILE = path.join(PROJECT_ROOT, '.claude', '.insights-lock');
const HOOK_EFFECTIVENESS_PATH = path.join(LOGS_DIR, 'hook-effectiveness.jsonl');
const MEMORY_ACCESS_PATH = path.join(PROJECT_ROOT, '.claude', '.memory-access-log.jsonl');
const THRESHOLD_FILE = path.join(PROJECT_ROOT, '.claude', '.threshold-tuning.json');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.memory');

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

const MAX_JSONL_SIZE = 5 * 1024 * 1024; // 5MB guard

/**
 * Read a file safely. Returns null on any error or if file exceeds maxSize.
 */
function safeRead(filePath, maxSize) {
  try {
    const stat = fs.statSync(filePath);
    if (maxSize && stat.size > maxSize) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parse a JSONL file into an array of objects.
 * If datePrefix is provided, only parses lines whose raw text contains it (fast pre-filter).
 * Skips files >5MB.
 */
function parseJsonl(filePath, datePrefix) {
  const content = safeRead(filePath, MAX_JSONL_SIZE);
  if (!content) return [];
  const results = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (datePrefix && !line.includes(datePrefix)) continue;
    try { results.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return results;
}

/**
 * Parse all entries from a JSONL file (no date filter). Skips files >5MB.
 */
function parseJsonlAll(filePath) {
  return parseJsonl(filePath, null);
}

// ── Analysis Functions ──────────────────────────────────────

/**
 * Analyze mode transitions from mode-trace.jsonl.
 */
function analyzeModeTransitions(entries) {
  if (entries.length === 0) return null;

  const transitions = {};
  const triggerCounts = {};
  const signalCounts = {};

  for (const e of entries) {
    const key = `${e.prev_mode} → ${e.next_mode}`;
    transitions[key] = (transitions[key] || 0) + 1;
    triggerCounts[e.trigger] = (triggerCounts[e.trigger] || 0) + 1;
    if (e.matched_signal) {
      signalCounts[e.matched_signal] = (signalCounts[e.matched_signal] || 0) + 1;
    }
  }

  const topSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return { total: entries.length, transitions, triggerCounts, topSignals };
}

/**
 * Analyze hook effectiveness events.
 */
function analyzeHookEffectiveness(entries) {
  if (entries.length === 0) return null;

  const hookStats = {};
  for (const e of entries) {
    if (!hookStats[e.hook]) {
      hookStats[e.hook] = { total: 0, actions: {} };
    }
    hookStats[e.hook].total++;
    hookStats[e.hook].actions[e.action] = (hookStats[e.hook].actions[e.action] || 0) + 1;
  }

  return hookStats;
}

/**
 * Analyze memory access patterns.
 */
function analyzeMemoryAccess(entries) {
  if (entries.length === 0) return null;

  const fileCounts = {};
  for (const e of entries) {
    fileCounts[e.file] = (fileCounts[e.file] || 0) + 1;
  }

  return { totalAccesses: entries.length, fileCounts };
}

/**
 * Analyze memory staleness — find entries in long-term.md that are old.
 */
function analyzeMemoryStaleness() {
  const content = safeRead(path.join(MEMORY_DIR, 'long-term.md'));
  if (!content) return null;

  const now = Date.now();
  const dateRegex = /\[(\d{4}-\d{2}-\d{2})\]/;
  const entries = [];

  for (const line of content.split('\n')) {
    if (!line.trimStart().startsWith('-')) continue;
    const match = line.match(dateRegex);
    if (!match) continue;
    const ageDays = Math.floor((now - new Date(match[1]).getTime()) / 86400000);
    if (ageDays > 30) {
      entries.push({ text: line.trim().slice(0, 100), ageDays, date: match[1] });
      if (entries.length >= 10) break; // early exit
    }
  }

  return entries.length > 0 ? entries : null;
}

/**
 * Generate threshold tuning suggestions based on mode-trace data.
 */
function generateThresholdSuggestions(allTraceEntries) {
  // Analyze cross-file escalations to understand typical file counts
  const crossFileEntries = allTraceEntries.filter(e =>
    e.reason && e.reason.startsWith('cross-file:')
  );

  if (crossFileEntries.length < 3) return null;

  // Extract file counts from reason strings
  const fileCounts = crossFileEntries.map(e => {
    const match = e.reason.match(/(\d+)\s+files\s+touched/);
    return match ? parseInt(match[1], 10) : null;
  }).filter(Boolean);

  if (fileCounts.length === 0) return null;

  fileCounts.sort((a, b) => a - b);
  const median = fileCounts[Math.floor(fileCounts.length / 2)];

  // Load current thresholds
  let currentStandard = 3;
  let currentHeavy = 6;
  try {
    const raw = safeRead(THRESHOLD_FILE);
    if (raw) {
      const config = JSON.parse(raw);
      currentStandard = config.cross_file_standard || 3;
      currentHeavy = config.cross_file_heavy || 6;
    }
  } catch { /* use defaults */ }

  const suggestions = [];

  if (median > currentStandard * 2) {
    const newVal = Math.min(currentStandard + 2, 15);
    suggestions.push(`Standard 阈值偏低: 中位数触发文件数 ${median}, 当前阈值 ${currentStandard} → 建议提高到 ${newVal}`);
  } else if (median < currentStandard * 0.5 && currentStandard > 2) {
    const newVal = Math.max(currentStandard - 1, 2);
    suggestions.push(`Standard 阈值偏高: 中位数触发文件数 ${median}, 当前阈值 ${currentStandard} → 建议降低到 ${newVal}`);
  }

  if (median > currentHeavy * 2) {
    const newVal = Math.min(currentHeavy + 2, 20);
    suggestions.push(`Heavy 阈值偏低: 中位数触发文件数 ${median}, 当前阈值 ${currentHeavy} → 建议提高到 ${newVal}`);
  } else if (median < currentHeavy * 0.5 && currentHeavy > 4) {
    const newVal = Math.max(currentHeavy - 1, 4);
    suggestions.push(`Heavy 阈值偏高: 中位数触发文件数 ${median}, 当前阈值 ${currentHeavy} → 建议降低到 ${newVal}`);
  }

  return suggestions.length > 0 ? { median, currentStandard, currentHeavy, suggestions } : null;
}

/**
 * Check for recurring patterns across recent insights files.
 */
function checkRecurringPatterns() {
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('insights-') && f.endsWith('.md'))
      .sort()
      .slice(-7); // Last 7 days

    if (files.length < 3) return null;

    // Extract signal sections by splitting on ## headings
    const signalHistory = {};
    for (const f of files) {
      const content = safeRead(path.join(LOGS_DIR, f), MAX_JSONL_SIZE);
      if (!content) continue;
      const sections = content.split(/\n## /);
      const signalSection = sections.find(s => s.startsWith('模式切换统计'));
      if (!signalSection) continue;
      // Find lines after "最频繁升档信号:" marker
      const markerIdx = signalSection.indexOf('最频繁升档信号');
      if (markerIdx === -1) continue;
      const afterMarker = signalSection.slice(markerIdx).split('\n').slice(1);
      for (const l of afterMarker) {
        if (!l.startsWith('- ')) break; // stop at first non-list line
        const key = l.replace(/\(\d+次\)/, '').trim();
        signalHistory[key] = (signalHistory[key] || 0) + 1;
      }
    }

    const recurring = Object.entries(signalHistory)
      .filter(([, count]) => count >= 3)
      .map(([signal, count]) => ({ signal, days: count }));

    return recurring.length > 0 ? recurring : null;
  } catch {
    return null;
  }
}

// ── Report Generation ───────────────────────────────────────

function generateReport(dateStr) {
  const parts = [`# 审计洞察报告 — ${dateStr}\n`];

  // 1. Mode transitions (need both today-only and all for threshold analysis)
  const todayTrace = parseJsonl(MODE_TRACE_PATH, dateStr);
  const allTrace = parseJsonlAll(MODE_TRACE_PATH);
  const modeAnalysis = analyzeModeTransitions(todayTrace);

  parts.push('## 模式切换统计\n');
  if (modeAnalysis) {
    parts.push(`总计 ${modeAnalysis.total} 次模式变化:\n`);
    for (const [transition, count] of Object.entries(modeAnalysis.transitions)) {
      parts.push(`- ${transition}: ${count}次`);
    }
    parts.push('');
    parts.push('触发源分布:');
    for (const [trigger, count] of Object.entries(modeAnalysis.triggerCounts)) {
      parts.push(`- ${trigger}: ${count}次`);
    }
    parts.push('');
    if (modeAnalysis.topSignals.length > 0) {
      parts.push('最频繁升档信号:');
      for (const [signal, count] of modeAnalysis.topSignals) {
        const display = signal.length > 60 ? signal.slice(0, 60) + '...' : signal;
        parts.push(`- ${display} (${count}次)`);
      }
    }
  } else {
    parts.push('今日无模式变化记录。');
  }
  parts.push('');

  // 2. Hook effectiveness (today only)
  const todayHookEvents = parseJsonl(HOOK_EFFECTIVENESS_PATH, dateStr);
  const hookAnalysis = analyzeHookEffectiveness(todayHookEvents);

  parts.push('## Hook 效能统计\n');
  if (hookAnalysis) {
    for (const [hook, stats] of Object.entries(hookAnalysis)) {
      const actions = Object.entries(stats.actions)
        .map(([a, c]) => `${a}=${c}`)
        .join(', ');
      parts.push(`- **${hook}**: ${stats.total}次 (${actions})`);
    }
  } else {
    parts.push('今日无 hook 效能事件。');
  }
  parts.push('');

  // 3. Memory access (today only)
  const todayMemAccess = parseJsonl(MEMORY_ACCESS_PATH, dateStr);
  const memAnalysis = analyzeMemoryAccess(todayMemAccess);

  parts.push('## 记忆访问统计\n');
  if (memAnalysis) {
    parts.push(`总计 ${memAnalysis.totalAccesses} 次记忆加载:`);
    for (const [file, count] of Object.entries(memAnalysis.fileCounts)) {
      parts.push(`- ${file}: ${count}次`);
    }
  } else {
    parts.push('今日无记忆访问日志。');
  }
  parts.push('');

  // 4. Memory staleness
  const staleEntries = analyzeMemoryStaleness();
  parts.push('## 记忆新鲜度\n');
  if (staleEntries) {
    parts.push(`发现 ${staleEntries.length} 条超过 30 天的 long-term 条目:`);
    for (const e of staleEntries) {
      parts.push(`- [${e.date}, ${e.ageDays}天前] ${e.text}`);
    }
    parts.push('');
    parts.push('> 建议审阅这些条目，移除过时内容或确认仍然有效。');
  } else {
    parts.push('所有记忆条目在 30 天内，无需清理。');
  }
  parts.push('');

  // 5. Threshold tuning
  const thresholdSuggestions = generateThresholdSuggestions(allTrace);
  parts.push('## 阈值调优建议\n');
  if (thresholdSuggestions) {
    parts.push(`跨文件升档中位数: ${thresholdSuggestions.median} 文件`);
    parts.push(`当前阈值: Standard=${thresholdSuggestions.currentStandard}, Heavy=${thresholdSuggestions.currentHeavy}`);
    for (const s of thresholdSuggestions.suggestions) {
      parts.push(`- **建议**: ${s}`);
    }
    parts.push('');
    parts.push('> 如需应用, 编辑 `.claude/.threshold-tuning.json` 或运行:');
    parts.push('> `node -e "fs.writeFileSync(\'.claude/.threshold-tuning.json\', JSON.stringify({...}))"` ');
  } else {
    parts.push('数据不足或当前阈值合理，无调优建议。');
  }
  parts.push('');

  // 6. Recurring patterns
  const recurring = checkRecurringPatterns();
  parts.push('## 反复出现的模式\n');
  if (recurring) {
    for (const r of recurring) {
      parts.push(`- ${r.signal} — 连续 ${r.days} 天出现`);
    }
    parts.push('');
    parts.push('> 连续 3 天以上的模式建议写入 `.memory/long-term.md`。');
  } else {
    parts.push('未检测到连续多天的重复模式。');
  }
  parts.push('');

  return parts.join('\n');
}

// ── Main ────────────────────────────────────────────────────

function main() {
  const today = getLocalDateString();

  // Daily throttle
  const lockDate = safeRead(LOCK_FILE);
  if (lockDate && lockDate.trim() === today) {
    log('[AuditInsights] Already ran today, skipping.');
    return;
  }

  // Ensure logs directory
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const report = generateReport(today);
  const reportPath = path.join(LOGS_DIR, `insights-${today}.md`);

  try {
    fs.writeFileSync(reportPath, report, 'utf8');
    log(`[AuditInsights] Report generated: ${reportPath}`);
  } catch (err) {
    log(`[AuditInsights] Failed to write report: ${err.message}`);
  }

  // Write lock
  try {
    fs.writeFileSync(LOCK_FILE, today, 'utf8');
  } catch { /* non-blocking */ }

  // Truncate logs to prevent unbounded growth
  try {
    const { truncateLog } = require('../lib/hook-effectiveness');
    truncateLog();
  } catch { /* non-blocking */ }

  try {
    const memLog = safeRead(MEMORY_ACCESS_PATH);
    if (memLog) {
      const lines = memLog.trim().split('\n');
      if (lines.length > 2000) {
        fs.writeFileSync(MEMORY_ACCESS_PATH, lines.slice(-1000).join('\n') + '\n', 'utf8');
      }
    }
  } catch { /* non-blocking */ }
}

// ── stdin entry point ───────────────────────────────────────
const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    stdinData += chunk.substring(0, Math.min(chunk.length, MAX_STDIN - stdinData.length));
  }
});
process.stdin.on('end', () => {
  try {
    main();
  } catch (err) {
    log(`[AuditInsights] Error: ${err.message}`);
  }
  process.stdout.write(stdinData);
  process.exit(0);
});
