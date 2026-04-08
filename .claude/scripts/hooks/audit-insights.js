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

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
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

/**
 * Parse a JSONL file into an array of objects.
 * Silently skips malformed lines.
 */
function parseJsonl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Filter entries from today only.
 */
function filterToday(entries, dateStr) {
  return entries.filter(e => e.timestamp && e.timestamp.startsWith(dateStr));
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
  const longTermPath = path.join(MEMORY_DIR, 'long-term.md');
  if (!fs.existsSync(longTermPath)) return null;

  try {
    const content = fs.readFileSync(longTermPath, 'utf8');
    const lines = content.split('\n');
    const entries = [];
    const dateRegex = /\[(\d{4}-\d{2}-\d{2})\]/;

    for (const line of lines) {
      const match = line.match(dateRegex);
      if (match && line.trim().startsWith('-')) {
        const entryDate = new Date(match[1]);
        const ageMs = Date.now() - entryDate.getTime();
        const ageDays = Math.floor(ageMs / (86400 * 1000));
        if (ageDays > 30) {
          entries.push({ text: line.trim().slice(0, 100), ageDays, date: match[1] });
        }
      }
    }

    return entries.length > 0 ? entries.slice(0, 10) : null;
  } catch {
    return null;
  }
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
    if (fs.existsSync(THRESHOLD_FILE)) {
      const config = JSON.parse(fs.readFileSync(THRESHOLD_FILE, 'utf8'));
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

    // Simple check: look for repeated top signals across days
    const signalHistory = {};
    for (const f of files) {
      const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8');
      const signalMatch = content.match(/最频繁升档信号[\s\S]*?(?=\n##|\n$)/);
      if (signalMatch) {
        const lines = signalMatch[0].split('\n').filter(l => l.startsWith('- '));
        for (const l of lines) {
          const key = l.replace(/\(\d+次\)/, '').trim();
          signalHistory[key] = (signalHistory[key] || 0) + 1;
        }
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

  // 1. Mode transitions
  const allTrace = parseJsonl(MODE_TRACE_PATH);
  const todayTrace = filterToday(allTrace, dateStr);
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

  // 2. Hook effectiveness
  const allHookEvents = parseJsonl(HOOK_EFFECTIVENESS_PATH);
  const todayHookEvents = filterToday(allHookEvents, dateStr);
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

  // 3. Memory access
  const allMemAccess = parseJsonl(MEMORY_ACCESS_PATH);
  const todayMemAccess = filterToday(allMemAccess, dateStr);
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
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockDate = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (lockDate === today) {
        log('[AuditInsights] Already ran today, skipping.');
        return;
      }
    }
  } catch { /* proceed */ }

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
    if (fs.existsSync(MEMORY_ACCESS_PATH)) {
      const content = fs.readFileSync(MEMORY_ACCESS_PATH, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length > 2000) {
        const kept = lines.slice(-1000).join('\n') + '\n';
        fs.writeFileSync(MEMORY_ACCESS_PATH, kept, 'utf8');
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
