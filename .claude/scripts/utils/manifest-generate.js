#!/usr/bin/env node
/**
 * manifest-generate.js — System manifest with drift detection.
 *
 * Generates a snapshot of the current ~/.claude/ system state:
 *   hooks / agents / skills / commands / state files / mode entries
 * AND a drift report exposing inconsistencies between registration sources
 * (settings.json, INDEX.md, model-map.js) and the filesystem.
 *
 * 2026-05-20 (P0): Created per Codex's "可生成 manifest" direction.
 * Critical: must report drift/unknown items, not just generate markdown,
 * otherwise it's just automated documentation without closing the loop.
 *
 * Usage:
 *   node ~/.claude/scripts/utils/manifest-generate.js
 *   node ~/.claude/scripts/utils/manifest-generate.js --drift-only   # just the drift report
 *
 * Output: stdout markdown. NO files written. NO state.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const ROOT = path.join(HOME, '.claude');

function parseArgs(argv) {
  const args = { driftOnly: false };
  for (const a of argv) if (a === '--drift-only') args.driftOnly = true;
  return args;
}

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function lsSafe(p)   { try { return fs.readdirSync(p); } catch { return []; } }
function existsSafe(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

// ── Hooks ──────────────────────────────────────────────────────
function scanHooks() {
  const dir = path.join(ROOT, 'scripts', 'hooks');
  const files = lsSafe(dir).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
  const settings = readSafe(path.join(ROOT, 'settings.json'));
  const registered = new Set();
  const re = /scripts\/hooks\/([a-z0-9-]+)\.js/g;
  let m;
  while ((m = re.exec(settings)) !== null) registered.add(m[1]);
  const active = files.filter(f => registered.has(f));
  const orphan = files.filter(f => !registered.has(f));
  return { files, active, orphan, registered: [...registered] };
}

// ── Agents ─────────────────────────────────────────────────────
function scanAgents() {
  const dir = path.join(ROOT, 'agents');
  const files = lsSafe(dir).filter(f => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const content = readSafe(path.join(dir, f));
    const m = content.match(/^name:\s*(.+)$/m);
    const name = m ? m[1].trim() : '?';
    const isCapital = /^[A-Z]/.test(name) && /\s/.test(name);
    out.push({ file: f, name, kind: isCapital ? 'Capital' : 'lowercase' });
  }
  return out;
}

// ── Skills ─────────────────────────────────────────────────────
function scanSkills() {
  const dir = path.join(ROOT, 'skills');
  const dirs = lsSafe(dir).filter(d => {
    try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; }
  });
  const skills = dirs.filter(d => existsSafe(path.join(dir, d, 'SKILL.md')));
  const index = readSafe(path.join(dir, 'INDEX.md'));
  const indexNames = new Set();
  const re = /\[([a-zA-Z0-9_-]+)\]\([a-zA-Z0-9_-]+\/SKILL\.md\)/g;
  let m;
  while ((m = re.exec(index)) !== null) indexNames.add(m[1]);
  const missingFromIndex = skills.filter(s => !indexNames.has(s));
  const indexedButMissing = [...indexNames].filter(n => !skills.includes(n));
  return { skills, indexNames: [...indexNames], missingFromIndex, indexedButMissing };
}

// ── Commands ───────────────────────────────────────────────────
function scanCommands() {
  const dir = path.join(ROOT, 'commands');
  return lsSafe(dir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
}

// ── State files (扫 hook 源码找写入路径) ─────────────────────
function scanStateFiles() {
  const dir = path.join(ROOT, 'scripts');
  const found = new Set();
  function walk(d) {
    for (const e of lsSafe(d)) {
      const full = path.join(d, e);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (e.endsWith('.js')) {
          const c = readSafe(full);
          // ~/.claude/state/<name>.json or .claude/state/...
          const re = /['"`]([^'"`]*\.claude\/(?:state|logs|\.session-state)\/[^'"`]+\.(?:json|jsonl|md))['"`]/g;
          let m;
          while ((m = re.exec(c)) !== null) found.add(m[1].replace(/.*\.claude\//, '.claude/'));
          // path.join(... 'state', '...')
          const re2 = /path\.join\([^)]*['"]state['"][^)]*['"]([^'"]+\.(?:json|jsonl))/g;
          while ((m = re2.exec(c)) !== null) found.add('.claude/state/' + m[1]);
        }
      } catch {}
    }
  }
  walk(dir);
  return [...found].sort();
}

// ── Mode entries (grep 写 mode-trace 的 trigger 值) ─────────
function scanModeEntries() {
  const dir = path.join(ROOT, 'scripts', 'hooks');
  const triggers = new Set();
  for (const f of lsSafe(dir).filter(x => x.endsWith('.js'))) {
    const c = readSafe(path.join(dir, f));
    // trigger: 'xxx' or trigger: "xxx"
    const re = /trigger:\s*['"]([a-z][a-z0-9-]+)['"]/g;
    let m;
    while ((m = re.exec(c)) !== null) triggers.add(m[1]);
  }
  return [...triggers].sort();
}

// ── model-map agents ────────────────────────────────────────
function scanModelMapAgents() {
  const c = readSafe(path.join(ROOT, 'scripts', 'lib', 'model-map.js'));
  const out = new Set();
  const re = /^\s*['"]([a-zA-Z0-9_-]+(?:\s[a-zA-Z0-9_-]+)*)['"]:\s*['"][a-z]+['"]/gm;
  let m;
  while ((m = re.exec(c)) !== null) out.add(m[1]);
  return [...out].sort();
}

// ── Drift detection ────────────────────────────────────────
function detectDrift(hooks, agents, skills, modelMapAgents) {
  const drift = {};

  // D1: orphan hooks (file exists but not registered in settings.json)
  drift.orphanHooks = hooks.orphan;

  // D2: INDEX.md vs filesystem mismatch
  drift.skillsMissingFromIndex = skills.missingFromIndex;
  drift.indexedSkillsMissing = skills.indexedButMissing;

  // D3: model-map references missing agents.
  //   model-map.js indexes by file-slug (e.g. "engineering-ai-engineer")
  //   AND occasionally by Capital frontmatter name (e.g. "agents orchestrator").
  //   So a model-map key is dangling only if BOTH (file-slug match) AND
  //   (frontmatter name match) miss.
  const agentNames = new Set(agents.map(a => a.name));
  const agentSlugs = new Set(agents.map(a => a.file.replace(/\.md$/, '')));
  drift.modelMapDangling = modelMapAgents.filter(n => !agentNames.has(n) && !agentSlugs.has(n));

  // D4: lowercase vs Capital normalize-equal (namespace conflict)
  const norm = s => s.toLowerCase().replace(/\s/g, '-');
  const seen = {};
  for (const a of agents) {
    const k = norm(a.name);
    if (!seen[k]) seen[k] = [];
    seen[k].push(a);
  }
  drift.namespaceConflicts = Object.entries(seen)
    .filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => ({ key: k, agents: arr }));

  // D5: hook 文案 CLAUDE.md § 引用未加作用域前缀 (违反 §Hook 文案锚点规则)
  // 抓"未前缀作用域的 CLAUDE.md § 引用" — 包括裸数字章节号和裸中文章节名
  // (设计目的: 任何 CLAUDE.md § 引用必须以 ~/.claude/ 或 PROJECT/ 开头)
  const hookDir = path.join(ROOT, 'scripts', 'hooks');
  drift.hookAnchorViolations = [];
  for (const f of lsSafe(hookDir).filter(x => x.endsWith('.js'))) {
    const c = readSafe(path.join(hookDir, f));
    // 找 CLAUDE.md §<数字/汉字数字>... 且前面没有 PROJECT/ 或 ~/.claude/
    const re = /(?:^|[^A-Za-z~\/.])CLAUDE\.md\s*§\s*[一-龥0-9]/g;
    let m;
    while ((m = re.exec(c)) !== null) {
      const start = m.index;
      const lookback = c.substring(Math.max(0, start - 30), start);
      if (lookback.includes('PROJECT/') || lookback.includes('~/.claude/')) continue;
      const line = c.substring(0, start).split('\n').length;
      drift.hookAnchorViolations.push(`${f}:${line}`);
    }
  }

  // D6: hook 数据流契约不完整 (M5a, Codex 推荐优先做 — 对应 M3 触发场景第 7 类)
  // 检测每个注册 hook 是否实现 stdin → stdout passthrough OR 显式阻断 exit.
  // 排除:
  //   - SessionStart hooks (写 stdout 输出给 Claude, 不是 chain 传递)
  //   - PreToolUse 阻断式 guard (exit 1/2 阻断, passthrough 反而抵消阻断意图)
  drift.hookContractIncomplete = [];
  const passthroughExclude = new Set([
    'session-start', 'task-router', 'rules-loader',  // SessionStart 输出类
    'careful-guard', 'freeze-guard',                   // PreToolUse 阻断式 (exit 1/2)
    'evaluation-gate', 'fix-depth-check',              // PreToolUse 阻断式 (exit 2)
    'auto-model',                                       // 已知 utility, 非注册 hook
  ]);
  for (const hookName of hooks.active) {
    if (passthroughExclude.has(hookName)) continue;
    const filePath = path.join(hookDir, hookName + '.js');
    if (!fs.existsSync(filePath)) continue;
    const c = readSafe(filePath);
    const readsStdin = /process\.stdin\.on\s*\(\s*['"]data['"]/.test(c) || /process\.stdin\.on\s*\(\s*['"]end['"]/.test(c);
    if (!readsStdin) continue;
    // Accept passthrough OR explicit exit (1/2 = blocking semantics)
    const writesStdoutPassthrough = /process\.stdout\.write\s*\(\s*(stdinData|d|raw|input|rawInput|chunks|buf)/.test(c);
    const explicitBlockingExit = /process\.exit\s*\(\s*[12]\s*\)/.test(c);
    if (!writesStdoutPassthrough && !explicitBlockingExit) {
      drift.hookContractIncomplete.push(`${hookName}.js (reads stdin but no passthrough/blocking-exit)`);
    }
  }

  // D7: agents-orchestrator team list 引用实际不存在的 agent
  const orchPath = path.join(ROOT, 'agents', 'agents-orchestrator.md');
  drift.orchestratorDangling = [];
  if (fs.existsSync(orchPath)) {
    const orch = readSafe(orchPath);
    const agentSlugs = new Set(lsSafe(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')));
    // Match `- **agent-slug**:` pattern
    const re = /^- \*\*([a-z][a-z0-9-]+)\*\*:/gm;
    let m;
    while ((m = re.exec(orch)) !== null) {
      const slug = m[1];
      if (!agentSlugs.has(slug)) {
        drift.orchestratorDangling.push(slug);
      }
    }
  }

  // D8: CLAUDE.md / rules/common 引用 ~/.claude/ 路径但 path 实际不存在
  drift.danglingDocRefs = [];
  const docsToScan = [
    path.join(ROOT, 'CLAUDE.md'),
    ...lsSafe(path.join(ROOT, 'rules', 'common')).map(f => path.join(ROOT, 'rules', 'common', f)),
  ];
  for (const docPath of docsToScan) {
    if (!fs.existsSync(docPath)) continue;
    const c = readSafe(docPath);
    const docName = docPath.replace(ROOT, '~/.claude');
    // Match `~/.claude/<path>` references.
    // ⚠ Regex order matters: jsonl > json > js (longest first to prevent `.json` → `.js` mis-truncation)
    // Exclude placeholders: <name>.ext / X.ext / *.ext / **/path.ext
    const re = /`?(~\/\.claude\/[a-zA-Z0-9_./\-]+\.(?:jsonl|json|md|js))`?/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(c)) !== null) {
      const refPath = m[1];
      if (seen.has(refPath)) continue;
      seen.add(refPath);
      // Skip placeholders
      if (/\/X\.|\/<[^>]+>\.|\/\*+\.|\/\*\*/.test(refPath)) continue;
      const absPath = refPath.replace('~', HOME);
      if (!fs.existsSync(absPath)) {
        drift.danglingDocRefs.push(`${docName.replace(HOME, '~')} → ${refPath}`);
      }
    }
  }

  return drift;
}

// ── Output ─────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const hooks = scanHooks();
  const agents = scanAgents();
  const skills = scanSkills();
  const commands = scanCommands();
  const stateFiles = scanStateFiles();
  const modeEntries = scanModeEntries();
  const modelMapAgents = scanModelMapAgents();
  const drift = detectDrift(hooks, agents, skills, modelMapAgents);

  const ts = new Date().toISOString();

  if (!args.driftOnly) {
    console.log(`# System Manifest — ${ts}`);
    console.log('');
    console.log(`## Hooks (${hooks.files.length} files, ${hooks.active.length} active, ${hooks.orphan.length} orphan)`);
    console.log('');
    console.log('### Active (registered in settings.json)');
    for (const h of hooks.active.sort()) console.log(`- ${h}`);
    console.log('');
    if (hooks.orphan.length) {
      console.log('### Orphan (file exists but NOT in settings.json — may be utility or dead code)');
      for (const h of hooks.orphan.sort()) console.log(`- ${h}`);
      console.log('');
    }

    console.log(`## Agents (${agents.length} total)`);
    console.log('');
    const lowercase = agents.filter(a => a.kind === 'lowercase').sort((a, b) => a.name.localeCompare(b.name));
    const Capital = agents.filter(a => a.kind === 'Capital').sort((a, b) => a.name.localeCompare(b.name));
    console.log(`### lowercase (基础设施, ${lowercase.length})`);
    for (const a of lowercase) console.log(`- \`${a.name}\` (${a.file})`);
    console.log('');
    console.log(`### Capital Phrase (专长, ${Capital.length})`);
    for (const a of Capital) console.log(`- \`${a.name}\` (${a.file})`);
    console.log('');

    console.log(`## Skills (${skills.skills.length} dirs, ${skills.indexNames.length} in INDEX.md)`);
    console.log('');
    console.log(`## Commands (${commands.length})`);
    console.log('');
    console.log(`## Mode trigger values (in mode-trace.jsonl)`);
    for (const t of modeEntries) console.log(`- ${t}`);
    console.log('');
    console.log(`## State files (extracted from hook source)`);
    for (const s of stateFiles) console.log(`- ${s}`);
    console.log('');
    console.log(`## model-map.js registered agents (${modelMapAgents.length})`);
    for (const n of modelMapAgents) console.log(`- ${n}`);
    console.log('');
  }

  // ── Drift Report (always shown) ──
  console.log('# Drift Report');
  console.log('');
  let driftCount = 0;
  const section = (title, items, formatter) => {
    if (items.length === 0) {
      console.log(`### ${title}: 0 ✓`);
      console.log('');
      return;
    }
    driftCount += items.length;
    console.log(`### ${title}: ${items.length} ⚠`);
    for (const it of items) console.log(`- ${formatter(it)}`);
    console.log('');
  };

  section('D1 Orphan hooks (file exists, not in settings.json)', drift.orphanHooks, x => x);
  section('D2a Skills present but missing from INDEX.md', drift.skillsMissingFromIndex, x => x);
  section('D2b Skills in INDEX.md but missing on disk', drift.indexedSkillsMissing, x => x);
  section('D3 model-map.js references missing agent names', drift.modelMapDangling, x => x);
  section('D4 Namespace conflicts (lowercase ↔ Capital normalize-equal)', drift.namespaceConflicts, c =>
    `${c.key} ← ${c.agents.map(a => `${a.name}(${a.file})`).join(' / ')}`);
  section('D5 Hook stderr CLAUDE.md § references missing scope prefix (~/.claude/ or PROJECT/)', drift.hookAnchorViolations, x => x);
  section('D6 Hook data flow contract: reads stdin but no passthrough (chain break risk)', drift.hookContractIncomplete, x => x);
  section('D7 agents-orchestrator.md team list references missing agents', drift.orchestratorDangling, x => x);
  section('D8 CLAUDE.md / rules/common doc references pointing to non-existent paths', drift.danglingDocRefs, x => x);

  console.log(`---\n**Total drift items: ${driftCount}**`);
  console.log(driftCount === 0
    ? '✓ System manifest clean. No registration/documentation drift detected.'
    : '⚠ Action needed. Each drift type has a recommended fix path:');
  if (driftCount > 0) {
    console.log('- D1: hooks should be in settings.json OR moved to scripts/utils/ (utilities)');
    console.log('- D2: sync INDEX.md with actual skills dirs');
    console.log('- D3: clean stale agent names from model-map.js');
    console.log('- D4: rename one to break normalize-equal collision');
    console.log('- D5: prefix with `~/.claude/CLAUDE.md §` or `PROJECT/CLAUDE.md §` per agents.md §Hook 文案锚点规则');
    console.log('- D6: add stdin passthrough (process.stdout.write(stdinData)) or document why excluded');
    console.log('- D7: update agents-orchestrator team list to match actual agent files');
    console.log('- D8: fix dangling path in source doc OR create the referenced file');
  }
}

try { main(); } catch (err) {
  console.error(`manifest-generate error: ${err.message}`);
  process.exit(1);
}
