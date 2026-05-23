#!/usr/bin/env node
/**
 * health-overview.js — Lightweight system health one-liner.
 *
 * Codex 2026-05-21 反馈："做一条总览命令，而不是做很多 dashboard。
 * 个人系统需要'一眼看健康度'：manifest drift、namespace ACK、hook test、
 * 最近 changelog、未完成事项。不要上可视化工程。"
 *
 * Aggregates outputs from existing utilities (no new detection logic):
 *   - manifest-generate.js --drift-only (D1-D8 drift counts)
 *   - namespace-check.js (Hard/Review/Acked/Warnings counts)
 *   - hook test pass/fail (run all __tests__/*.test.js)
 *   - SYSTEM-CHANGELOG.md (latest entry + current engineering indicators)
 *   - lesson-archive.md Follow-up section (open items count)
 *
 * Usage:
 *   node ~/.claude/scripts/utils/health-overview.js
 *
 * Output: stdout one-screen summary. THIS SCRIPT writes nothing.
 *
 * ⚠ Transitive side effects: This script does NOT write any files itself,
 * but it INVOKES other utilities/tests that may write to /tmp:
 *   - careful-guard.test.js uses mkdtemp() under /tmp for clean-tree cases
 *   - evaluation-gate.test.js may write temp marker files
 * Requires /tmp (or $TMPDIR) writable. If running in a read-only sandbox,
 * hook tests will fail with EPERM and report -1/-1 (see Codex review
 * 2026-05-21: contract violation root-cause docs not transitive).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const ROOT = path.join(HOME, '.claude');

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

function runSafe(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
  } catch (err) {
    return err.stdout ? err.stdout.toString() : `[error: ${err.message}]`;
  }
}

function pad(s, n) { return String(s).padEnd(n); }
function color(s, c) {
  const map = { red: '31', green: '32', yellow: '33', cyan: '36', dim: '2', bold: '1' };
  return process.stdout.isTTY ? `\x1b[${map[c] || '0'}m${s}\x1b[0m` : s;
}

// ── 1. Manifest drift summary ──
function manifestDrift() {
  const out = runSafe(`node "${path.join(ROOT, 'scripts', 'utils', 'manifest-generate.js')}" --drift-only 2>&1`);
  const m = out.match(/\*\*Total drift items:\s*(\d+)\*\*/);
  const total = m ? parseInt(m[1], 10) : -1;
  // Parse each D's count — use last colon before count (regex matches last `: N ✓/⚠`)
  const dCounts = {};
  for (const line of out.split('\n')) {
    const mm = line.match(/^###\s+(D\d+\w*)\b.*:\s*(\d+)\s*[✓⚠]/);
    if (mm) dCounts[mm[1]] = parseInt(mm[2], 10);
  }
  return { total, dCounts };
}

// ── 2. Namespace check summary ──
function namespaceCheck() {
  const out = runSafe(`node "${path.join(ROOT, 'scripts', 'utils', 'namespace-check.js')}" 2>&1`);
  const m = out.match(/\*\*Hard:\s*(\d+)\*\*\s*\|\s*Review:\s*(\d+)\s*\|\s*Acked:\s*(\d+)\s*\|\s*Warnings:\s*(\d+)/);
  if (!m) return { hard: -1, review: -1, acked: -1, warnings: -1 };
  return { hard: +m[1], review: +m[2], acked: +m[3], warnings: +m[4] };
}

// ── 3. Hook test pass/fail ──
function hookTests() {
  const dir = path.join(ROOT, 'scripts', 'hooks', '__tests__');
  const tests = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.test.js'))
    : [];
  const results = [];
  for (const f of tests) {
    const out = runSafe(`node "${path.join(dir, f)}" 2>&1`);
    // Accept both formats:
    //   "31 pass / 0 fail"   (fix-depth-check)
    //   "36 passed, 0 failed" (careful-guard / evaluation-gate)
    const m = out.match(/(\d+)\s+pass(?:ed)?\s*[,/]\s*(\d+)\s+fail(?:ed)?/);
    if (m) {
      results.push({ name: f.replace('.test.js', ''), pass: +m[1], fail: +m[2], err: null });
    } else {
      // Could not parse — extract first error signal so users see real cause
      const errMatch = out.match(/(EPERM|EACCES|ENOENT|EISDIR|TypeError|SyntaxError|Error[^\n]{0,80})/);
      const errHint = errMatch ? errMatch[1] : out.split('\n').filter(l => l.trim()).pop() || 'unknown';
      results.push({ name: f.replace('.test.js', ''), pass: -1, fail: -1, err: errHint });
    }
  }
  return results;
}

// ── 4. Engineering indicators from SYSTEM-CHANGELOG.md ──
function indicators() {
  const c = readSafe(path.join(ROOT, 'SYSTEM-CHANGELOG.md'));
  // Allow markdown **bold**, spaces, ASCII letters in name (e.g. "SSOT 一致性")
  const re = /\|\s*\*{0,2}([^|*][^|*]*?)\*{0,2}\s*\|\s*\*{0,2}(\d+(?:\.\d+)?\/10)\*{0,2}\s*(?:★[^|]*)?\|/g;
  const list = [];
  let m;
  while ((m = re.exec(c)) !== null) {
    const name = m[1].trim();
    const score = m[2];
    // Filter out header row and non-indicator entries
    if (/[一-龥]/.test(name) && !name.includes('指标')) {
      list.push({ name, score });
    }
    if (list.length >= 7) break;
  }
  return list;
}

// ── 5. Latest changelog entry summary ──
function latestChangelog() {
  const c = readSafe(path.join(ROOT, 'SYSTEM-CHANGELOG.md'));
  // Find first ### heading after "Session History"
  const idx = c.indexOf('## Session History');
  if (idx === -1) return null;
  const after = c.substring(idx);
  const m = after.match(/^###\s+([^\n]+)/m);
  return m ? m[1].trim() : null;
}

// ── 6. Open follow-up count ──
function openFollowups() {
  const c = readSafe(path.join(ROOT, 'on-demand', 'lesson-archive.md'));
  const followupIdx = c.indexOf('## Follow-up');
  if (followupIdx === -1) return 0;
  const sec = c.substring(followupIdx).split('\n## ')[0];
  return (sec.match(/^-\s+\[2026/gm) || []).length;
}

// ── Main output ──
function main() {
  const now = new Date().toISOString();
  console.log(color(`╔════════════════════════════════════════════════════════════════╗`, 'cyan'));
  console.log(color(`║  ~/.claude/ Health Overview                                    ║`, 'cyan'));
  console.log(color(`║  ${pad(now, 60)}║`, 'cyan'));
  console.log(color(`╚════════════════════════════════════════════════════════════════╝`, 'cyan'));
  console.log('');

  // Engineering indicators
  console.log(color('## Engineering Indicators (from SYSTEM-CHANGELOG.md)', 'bold'));
  const inds = indicators();
  if (inds.length === 0) {
    console.log(color('  ⚠ no indicators parsed — check SYSTEM-CHANGELOG.md format', 'yellow'));
  } else {
    for (const i of inds) {
      const val = parseFloat(i.score);
      const c = val >= 8 ? 'green' : val >= 7 ? 'yellow' : 'red';
      console.log(`  ${pad(i.name, 24)} ${color(i.score, c)}`);
    }
  }
  console.log('');

  // Drift
  console.log(color('## Manifest Drift (M1)', 'bold'));
  const d = manifestDrift();
  if (d.total < 0) {
    console.log(color('  ⚠ manifest-generate.js failed', 'red'));
  } else {
    const nonD1 = Object.entries(d.dCounts).filter(([k]) => k !== 'D1').reduce((s, [, v]) => s + v, 0);
    const d1 = d.dCounts.D1 || 0;
    const totalColor = nonD1 === 0 ? 'green' : 'red';
    console.log(`  Total: ${color(d.total, totalColor)} (D1 follow-up: ${d1}, others: ${nonD1})`);
    for (const [k, v] of Object.entries(d.dCounts)) {
      const c = v === 0 ? 'green' : (k === 'D1' ? 'dim' : 'red');
      console.log(`  ${pad(k, 6)} ${color(v, c)}`);
    }
  }
  console.log('');

  // Namespace
  console.log(color('## Namespace Check (M2)', 'bold'));
  const n = namespaceCheck();
  if (n.hard < 0) {
    console.log(color('  ⚠ namespace-check.js failed', 'red'));
  } else {
    console.log(`  Hard: ${color(n.hard, n.hard === 0 ? 'green' : 'red')} | Review: ${color(n.review, n.review === 0 ? 'green' : 'yellow')} | Acked: ${color(n.acked, 'dim')} | Warnings: ${color(n.warnings, n.warnings === 0 ? 'green' : 'yellow')}`);
  }
  console.log('');

  // Hook tests
  console.log(color('## Hook Tests (M4)', 'bold'));
  const tests = hookTests();
  if (tests.length === 0) {
    console.log(color('  ⚠ no __tests__/*.test.js found', 'yellow'));
  } else {
    let allPass = true;
    for (const t of tests) {
      const ok = t.fail === 0 && t.pass > 0;
      if (!ok) allPass = false;
      const status = ok ? color('✓', 'green') : color('✗', 'red');
      const detail = t.err
        ? `${color(`parse-fail (cause: ${t.err.slice(0, 60)})`, 'red')}`
        : `${t.pass} pass / ${t.fail} fail`;
      console.log(`  ${status} ${pad(t.name, 30)} ${detail}`);
    }
    if (!allPass) {
      console.log(color('  ⚠ If errors mention EPERM/EACCES on /tmp, this script needs writable temp dir (transitive: tests use mkdtemp)', 'yellow'));
    }
    console.log(`  ${allPass ? color('All pass', 'green') : color('Some failing', 'red')}`);
  }
  console.log('');

  // Latest changelog
  console.log(color('## Latest Session Change', 'bold'));
  const latest = latestChangelog();
  console.log(`  ${latest || color('(none)', 'dim')}`);
  console.log('');

  // Follow-ups
  const fu = openFollowups();
  console.log(color('## Open Follow-ups', 'bold'));
  console.log(`  ${color(fu, fu === 0 ? 'green' : 'yellow')} item(s) in lesson-archive.md §Follow-up`);
  console.log('');

  console.log(color('Source utilities (run for details):', 'dim'));
  console.log(color('  node ~/.claude/scripts/utils/manifest-generate.js --drift-only', 'dim'));
  console.log(color('  node ~/.claude/scripts/utils/namespace-check.js', 'dim'));
  console.log(color('  node ~/.claude/scripts/utils/rules-load-snapshot.js', 'dim'));
  console.log(color('  node ~/.claude/scripts/hooks/__tests__/*.test.js', 'dim'));
  console.log(color('  cat ~/.claude/SYSTEM-CHANGELOG.md', 'dim'));
}

try { main(); } catch (err) {
  console.error(`health-overview error: ${err.message}`);
  process.exit(1);
}
