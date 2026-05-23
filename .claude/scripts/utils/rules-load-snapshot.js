#!/usr/bin/env node
/**
 * rules-load-snapshot.js — One-shot SessionStart context-tax baseline.
 *
 * Manual tool. NO hook registration, NO persistent state, NO settings.json
 * change. Run on demand to see how much context the current rules-loader
 * setup will inject at SessionStart.
 *
 * 2026-05-20: Created per Codex保留意见 (Stage B Reject 后的可接受形态):
 *   Stage B's 7-day continuous observation was rejected because it accrued
 *   new hooks/state/docs but only measured static file linkage. A manual
 *   snapshot lets us see *current* context tax without adding any runtime
 *   component.
 *
 * Usage:
 *   node ~/.claude/scripts/utils/rules-load-snapshot.js
 *   node ~/.claude/scripts/utils/rules-load-snapshot.js --project /path/to/project
 *
 * Output: stdout only. No files written.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function parseArgs(argv) {
  const args = { project: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) args.project = argv[++i];
  }
  return args;
}

function estimateTokens(bytes) {
  // Heuristic: ~4 bytes/token for mixed ASCII/UTF-8 markdown.
  // CJK denser (~2 bytes/token), code blocks looser. Good enough for delta tracking.
  return Math.round(bytes / 4);
}

// 2026-05-20: Codex MODIFY 修复
//   ① 只统计 *.md (非 markdown 文件不算配置注入)
//   ② symlink 用 realpath 去重 (rules/active/ 经常 symlink 到 rules/common/,
//      不去重会重复计算同一物理文件)
// scanDir(dir, visited) — visited 是跨调用的 Set<realpath>，调用者传入并复用。
function scanDir(dir, visited) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }

    // 解析真实路径并去重 (含 symlink follow)
    let realPath;
    try { realPath = fs.realpathSync(full); } catch { continue; }
    if (visited.has(realPath)) continue;

    let tstat;
    try { tstat = fs.statSync(realPath); } catch { continue; }

    if (tstat.isDirectory()) {
      visited.add(realPath);
      entries.push(...scanDir(realPath, visited).map(e => ({ ...e, name: `${name}/${e.name}` })));
    } else if (tstat.isFile()) {
      // 只统计 markdown
      if (!/\.md$/i.test(name)) continue;
      visited.add(realPath);
      entries.push({ name, bytes: tstat.size, lines: countLines(realPath), path: realPath });
    }
  }
  return entries;
}

function countLines(p) {
  try { return fs.readFileSync(p, 'utf8').split('\n').length; }
  catch { return 0; }
}

function fmtBytes(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = path.resolve(args.project);
  const activeDir = path.join(project, '.claude', 'rules', 'active');
  const userCommonDir = path.join(os.homedir(), '.claude', 'rules', 'common');
  const userClaudeMd = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  const projectClaudeMd = path.join(project, 'CLAUDE.md');

  console.log(`# Rules Load Snapshot — ${new Date().toISOString()}`);
  console.log(`Project: ${project}`);
  console.log('');

  const sources = [];
  // 跨所有扫描源共享 visited (realpath set), 防止 user-rules-common 和
  // project-rules-active symlink 重叠导致同一物理文件被双计
  const visited = new Set();

  if (fs.existsSync(userClaudeMd)) {
    const s = fs.statSync(userClaudeMd);
    const rp = fs.realpathSync(userClaudeMd);
    if (!visited.has(rp)) {
      visited.add(rp);
      sources.push({ group: 'user-CLAUDE.md', name: 'CLAUDE.md', bytes: s.size, lines: countLines(userClaudeMd), path: userClaudeMd });
    }
  }
  if (fs.existsSync(projectClaudeMd)) {
    const s = fs.statSync(projectClaudeMd);
    const rp = fs.realpathSync(projectClaudeMd);
    if (!visited.has(rp)) {
      visited.add(rp);
      sources.push({ group: 'project-CLAUDE.md', name: 'CLAUDE.md', bytes: s.size, lines: countLines(projectClaudeMd), path: projectClaudeMd });
    }
  }
  for (const f of scanDir(userCommonDir, visited)) sources.push({ group: 'user-rules-common', ...f });
  for (const f of scanDir(activeDir, visited)) sources.push({ group: 'project-rules-active', ...f });

  // Group totals
  const groups = {};
  for (const s of sources) {
    if (!groups[s.group]) groups[s.group] = { bytes: 0, tokens: 0, files: 0 };
    groups[s.group].bytes += s.bytes;
    groups[s.group].tokens += estimateTokens(s.bytes);
    groups[s.group].files += 1;
  }

  console.log('## By group');
  let totalBytes = 0, totalTokens = 0;
  for (const [g, v] of Object.entries(groups)) {
    console.log(`  ${g.padEnd(24)} ${String(v.files).padStart(3)} files  ${fmtBytes(v.bytes).padStart(8)}  ~${v.tokens} tokens`);
    totalBytes += v.bytes;
    totalTokens += v.tokens;
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${String(sources.length).padStart(3)} files  ${fmtBytes(totalBytes).padStart(8)}  ~${totalTokens} tokens`);
  console.log('');

  console.log('## Per file');
  sources.sort((a, b) => b.bytes - a.bytes);
  for (const s of sources) {
    console.log(`  ${fmtBytes(s.bytes).padStart(8)}  ${String(s.lines).padStart(4)}L  ~${String(estimateTokens(s.bytes)).padStart(4)}t  [${s.group}] ${s.name}`);
  }
  console.log('');
  console.log('## Notes');
  console.log('  - token estimate = bytes/4 (heuristic; CJK denser, code blocks looser)');
  console.log('  - this snapshot reads only filesystem; does not measure runtime agent usage');
  console.log('  - Codex 反对持续观测 hook; 本工具仅为一次性基线，不写状态、不挂 hook');
}

try { main(); } catch (err) {
  console.error(`rules-load-snapshot error: ${err.message}`);
  process.exit(1);
}
