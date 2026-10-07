#!/usr/bin/env node
/**
 * rules-load-snapshot.js — 指令加载三口径估算（完成门 M3；harness 收缩计划 A1）。
 *   A1a 启动固定加载：用户 CLAUDE.md + 无 `paths:` 的 rules + 项目根 CLAUDE.md + MEMORY.md 实际加载部分（前 200 行 / 25KB 取小）
 *   A1b 按需路径规则：每个带 `paths:` 的 rules 文件单列（只在碰到匹配文件时加载）
 *   A1c 磁盘总量
 * token ≈ CJK 字 × 1.3 + 其余字节 / 4（2026-10-07 前按 bytes/4 估，CJK 低估约一倍）。
 * 用法：node rules-load-snapshot.js [项目目录]（默认 CLAUDE_PROJECT_DIR 或 cwd）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PROJECT = path.resolve(process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd());

function tok(s) {
  const cjk = (s.match(/[一-鿿　-〿＀-￯]/g) || []).length;
  return Math.round(cjk * 1.3 + (s.length - cjk) / 4);
}
function hasPaths(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 400);
  return head.startsWith('---') && /^paths:/m.test(head);
}
function walkMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}
function autoMemoryDir() {
  for (const f of [path.join(PROJECT, '.claude/settings.local.json'), path.join(PROJECT, '.claude/settings.json'), path.join(HOME, '.claude/settings.json')]) {
    try {
      const v = JSON.parse(fs.readFileSync(f, 'utf8')).autoMemoryDirectory;
      if (v) return v.startsWith('~/') ? path.join(HOME, v.slice(2)) : v;
    } catch { /* absent */ }
  }
  const slug = PROJECT.replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(HOME, '.claude/projects', slug, 'memory');
}

const fixed = []; const scoped = []; let disk = 0;
function add(label, file) {
  if (!fs.existsSync(file)) return;
  const s = fs.readFileSync(file, 'utf8'); disk += Buffer.byteLength(s);
  (hasPaths(file) ? scoped : fixed).push([label, file, tok(s)]);
}
add('user-CLAUDE.md', path.join(HOME, '.claude/CLAUDE.md'));
for (const f of walkMd(path.join(HOME, '.claude/rules'))) add('user-rules', f);
add('project-CLAUDE.md', path.join(PROJECT, 'CLAUDE.md'));
for (const f of walkMd(path.join(PROJECT, '.claude/rules'))) add('project-rules', f);
const mem = path.join(autoMemoryDir(), 'MEMORY.md');
if (fs.existsSync(mem)) {
  const s = fs.readFileSync(mem, 'utf8'); disk += Buffer.byteLength(s);
  const loaded = Buffer.from(s.split('\n').slice(0, 200).join('\n')).subarray(0, 25 * 1024).toString('utf8');
  fixed.push(['auto-memory(loaded)', mem, tok(loaded)]);
}
const short = (p) => p.replace(HOME, '~');
console.log(`# Rules Load Snapshot — ${new Date().toISOString()}\nProject: ${PROJECT}\n`);
console.log('## A1a 启动固定加载（token）');
for (const [l, f, t] of fixed) console.log(`  ${String(t).padStart(7)}  ${l.padEnd(22)} ${short(f)}`);
console.log(`  ${String(fixed.reduce((a, x) => a + x[2], 0)).padStart(7)}  TOTAL A1a`);
console.log('\n## A1b 按需路径规则（token，单列，不计入启动）');
if (!scoped.length) console.log('  (无)');
for (const [l, f, t] of scoped) console.log(`  ${String(t).padStart(7)}  ${l.padEnd(22)} ${short(f)}`);
console.log(`\n## A1c 磁盘总量: ${disk} B`);
console.log('\n注：token 为启发式估算；以新会话 /context 为准校准一次（差异 < 15%）。');
