#!/usr/bin/env node
/**
 * namespace-check.js — Naming conflict detection across hook/command/skill/agent.
 *
 * Sibling utility to manifest-generate.js. Focused on conflicts M1 does NOT
 * cover (M1 already does agent lowercase ↔ Capital normalize-equal in D4,
 * and hook stderr anchor in D5). M2 adds:
 *   - N1: settings.json registers multiple hooks on the SAME trigger
 *         (potential interaction risk; not always wrong but worth flagging)
 *   - N2: cross-layer naming conflicts — same name used as command/skill/agent
 *         (e.g. /code-review command vs code-reviewer agent vs
 *         requesting-code-review skill — user mental model collision risk)
 *   - N3: plugin skill name === user-level skill name (WARNING only, per
 *         Codex feedback — same name across sources is not always conflict)
 *
 * 2026-05-20 (M2): Created per Codex联合方案. Range narrowed from M2 original
 * draft after Codex Modify feedback.
 *
 * Usage:
 *   node ~/.claude/scripts/utils/namespace-check.js
 *
 * Output: stdout markdown. No files written.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const ROOT = path.join(HOME, '.claude');

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function lsSafe(p) { try { return fs.readdirSync(p); } catch { return []; } }

// ── ACK whitelist: known intentional patterns (severity downgrade) ──
// Hook groups on same trigger that are documented as intentional workflow composition.
// Format: '<trigger>:<matcher>' → reason
const ACKED_HOOK_GROUPS = {
  'SessionStart:*':              'init chain: session-start → task-router → rules-loader',
  'PreToolUse:Bash':             'guard chain: evaluation-gate / careful-guard / fix-depth-check',
  'PreToolUse:*':                'orthogonal: pre-tool-escalate (mode) + suggest-compact (context)',
  'PostToolUse:*':               'orthogonal: drift-detector (state) + periodic-memory (lessons)',
};
// Cross-layer name collisions that are intentional entrypoint patterns.
// command + skill same name = "command is invocation, skill is the capability"
const ENTRYPOINT_PATTERN_PAIRS = new Set(['command+skill']);

// ── N1: settings.json hooks on same trigger ─────────────
function checkHookTriggers() {
  let settings;
  try { settings = JSON.parse(readSafe(path.join(ROOT, 'settings.json'))); }
  catch { return []; }

  const hooks = settings.hooks || {};
  const conflicts = [];

  for (const [trigger, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const allHooks = [];
    for (const group of groups) {
      for (const h of (group.hooks || [])) {
        const m = (h.command || '').match(/scripts\/hooks\/([a-z0-9-]+)\.js/);
        if (m) allHooks.push({ matcher: group.matcher || '*', hook: m[1] });
      }
    }
    // Group by matcher
    const byMatcher = {};
    for (const e of allHooks) {
      if (!byMatcher[e.matcher]) byMatcher[e.matcher] = [];
      byMatcher[e.matcher].push(e.hook);
    }
    for (const [matcher, hookList] of Object.entries(byMatcher)) {
      if (hookList.length > 1) {
        const key = `${trigger}:${matcher || '*'}`;
        const acked = ACKED_HOOK_GROUPS[key];
        conflicts.push({ trigger, matcher: matcher || '*', hooks: hookList, acked });
      }
    }
  }
  return conflicts;
}

// ── N2: cross-layer naming collisions ───────────────────
function checkCrossLayerNames() {
  // Collect all names per layer
  const commands = lsSafe(path.join(ROOT, 'commands'))
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));

  const skills = lsSafe(path.join(ROOT, 'skills'))
    .filter(d => {
      try { return fs.statSync(path.join(ROOT, 'skills', d)).isDirectory(); }
      catch { return false; }
    });

  const agents = lsSafe(path.join(ROOT, 'agents'))
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = readSafe(path.join(ROOT, 'agents', f));
      const m = content.match(/^name:\s*(.+)$/m);
      return m ? m[1].trim() : f.replace(/\.md$/, '');
    });

  // Normalize: lowercase, dashes/spaces → unified
  const norm = s => s.toLowerCase().replace(/[\s_]+/g, '-');

  const map = new Map();  // normalized → [{layer, original}]
  for (const c of commands) {
    const k = norm(c);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ layer: 'command', name: c });
  }
  for (const s of skills) {
    const k = norm(s);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ layer: 'skill', name: s });
  }
  for (const a of agents) {
    const k = norm(a);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ layer: 'agent', name: a });
  }

  // Collisions = same normalized name across ≥2 layers
  const collisions = [];
  for (const [key, entries] of map) {
    const layers = [...new Set(entries.map(e => e.layer))].sort();
    if (layers.length >= 2) {
      const pairKey = layers.join('+');
      const entrypointPattern = ENTRYPOINT_PATTERN_PAIRS.has(pairKey);
      collisions.push({ key, entries, layers, entrypointPattern });
    }
  }
  return collisions;
}

// ── N4: declared-name vs filesystem-name consistency ─────
function checkDeclaredVsFilesystem() {
  const issues = [];

  // 4a. INDEX.md link text vs dir name (e.g. "[caveman](caveman/SKILL.md)")
  const indexPath = path.join(ROOT, 'skills', 'INDEX.md');
  const index = readSafe(indexPath);
  const re = /\[([a-zA-Z0-9_-]+)\]\(([a-zA-Z0-9_-]+)\/SKILL\.md\)/g;
  let m;
  while ((m = re.exec(index)) !== null) {
    if (m[1] !== m[2]) {
      issues.push({ kind: 'INDEX.md link/dir mismatch', text: m[1], dir: m[2] });
    }
  }

  // 4b. model-map.js key vs agent file basename
  const mmPath = path.join(ROOT, 'scripts', 'lib', 'model-map.js');
  const mm = readSafe(mmPath);
  const agentsDir = path.join(ROOT, 'agents');
  const agentBaseNames = new Set(lsSafe(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')));
  const agentFrontmatterNames = new Set();
  for (const f of lsSafe(agentsDir).filter(f => f.endsWith('.md'))) {
    const content = readSafe(path.join(agentsDir, f));
    const nm = content.match(/^name:\s*(.+)$/m);
    if (nm) agentFrontmatterNames.add(nm[1].trim());
  }
  const mmRe = /^\s*['"]([a-zA-Z0-9_\s-]+?)['"]:\s*['"][a-z]+['"]/gm;
  while ((m = mmRe.exec(mm)) !== null) {
    const key = m[1];
    // Skip non-agent keys (e.g. 'orchestrator', 'review', 'development' role names)
    // Agent-keys typically contain '-' or match an agent file/name
    if (!agentBaseNames.has(key) && !agentFrontmatterNames.has(key)) {
      // Could be a category role name like 'orchestrator' — skip unless it looks like an agent ref
      if (/^[a-z]+-[a-z]/.test(key) || /\s/.test(key)) {
        issues.push({ kind: 'model-map.js key not matching any agent file/name', key });
      }
    }
  }

  return issues;
}

// ── N3: plugin skill vs user-level skill same name (WARNING) ───
function checkPluginSkillOverlap() {
  // user-level skills
  const userSkills = new Set(lsSafe(path.join(ROOT, 'skills'))
    .filter(d => {
      try { return fs.statSync(path.join(ROOT, 'skills', d)).isDirectory(); }
      catch { return false; }
    }));

  // plugin skills under plugins/cache/*/<plugin>/<version>/skills/*
  // and plugins/marketplaces/<src>/plugins/<plugin>/skills/*
  const overlaps = [];
  const pluginRoots = [
    path.join(ROOT, 'plugins', 'cache'),
    path.join(ROOT, 'plugins', 'marketplaces'),
  ];
  for (const proot of pluginRoots) {
    if (!fs.existsSync(proot)) continue;
    walkSkills(proot, (pluginPath, skillName) => {
      if (userSkills.has(skillName)) {
        overlaps.push({ skill: skillName, plugin: pluginPath });
      }
    });
  }
  return overlaps;
}

function walkSkills(root, cb, depth = 0) {
  if (depth > 6) return;  // safety bound
  for (const e of lsSafe(root)) {
    const full = path.join(root, e);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (e === 'skills') {
      // immediate children are skills
      for (const skill of lsSafe(full)) {
        const sp = path.join(full, skill);
        try {
          if (fs.statSync(sp).isDirectory() && fs.existsSync(path.join(sp, 'SKILL.md'))) {
            cb(root, skill);
          }
        } catch {}
      }
    } else {
      walkSkills(full, cb, depth + 1);
    }
  }
}

// ── Output ─────────────────────────────────────────────
function section(title, items, formatter) {
  if (items.length === 0) {
    console.log(`### ${title}: 0 ✓`);
    console.log('');
    return 0;
  }
  console.log(`### ${title}: ${items.length} ⚠`);
  for (const it of items) console.log(`- ${formatter(it)}`);
  console.log('');
  return items.length;
}

function main() {
  const n1 = checkHookTriggers();
  const n2 = checkCrossLayerNames();
  const n3 = checkPluginSkillOverlap();
  const n4 = checkDeclaredVsFilesystem();

  console.log(`# Namespace Check — ${new Date().toISOString()}`);
  console.log('');

  // Severity classification (per Codex M2 review):
  //   - Hard: requires action (declared name mismatch, true conflict)
  //   - Review: needs human eye (unack'd hook trigger group, non-entrypoint cross-layer)
  //   - Acked: known intentional pattern (no action)
  //   - Warning: best-effort signal (plugin skill overlap)
  const acked = [];
  const review = [];

  // N1 partition: acked vs review
  for (const c of n1) {
    if (c.acked) acked.push({ kind: 'N1 hook-group', detail: `${c.trigger}:${c.matcher} [${c.hooks.join(', ')}] — ${c.acked}` });
    else review.push({ kind: 'N1 hook-group', detail: `${c.trigger}:${c.matcher} [${c.hooks.join(', ')}]` });
  }
  // N2 partition: entrypoint-pattern vs others
  for (const c of n2) {
    if (c.entrypointPattern) acked.push({ kind: 'N2 cross-layer', detail: `${c.key} ← ${c.entries.map(e => `${e.layer}:${e.name}`).join(' / ')} — entrypoint pattern` });
    else review.push({ kind: 'N2 cross-layer', detail: `${c.key} ← ${c.entries.map(e => `${e.layer}:${e.name}`).join(' / ')}` });
  }

  // N4 = Hard (declared mismatch is real drift)
  const hard = n4.map(i => ({ kind: 'N4 declared-name', detail: i.kind ? `${i.kind}: ${i.text || i.key} (dir=${i.dir || 'n/a'})` : JSON.stringify(i) }));

  // N3 = Warning
  const warn = n3.map(o => ({ kind: 'N3 plugin-overlap', detail: `skill="${o.skill}" plugin=${o.plugin.replace(ROOT + '/', '')}` }));

  console.log(`## Hard (requires action): ${hard.length}`);
  for (const it of hard) console.log(`- ${it.kind}: ${it.detail}`);
  console.log('');

  console.log(`## Review (needs human eye): ${review.length}`);
  for (const it of review) console.log(`- ${it.kind}: ${it.detail}`);
  console.log('');

  console.log(`## Acked (known intentional pattern, no action): ${acked.length}`);
  for (const it of acked) console.log(`- ${it.kind}: ${it.detail}`);
  console.log('');

  console.log(`## Warnings (best-effort signal): ${warn.length}`);
  for (const it of warn) console.log(`- ${it.kind}: ${it.detail}`);
  console.log('');

  console.log('---');
  console.log(`**Hard: ${hard.length}** | Review: ${review.length} | Acked: ${acked.length} | Warnings: ${warn.length}`);
  if (hard.length === 0 && review.length === 0) {
    console.log('✓ No actionable namespace issues.');
  } else {
    console.log('Hints:');
    console.log('- Hard (N4): rename in declared source OR filesystem to align');
    console.log('- Review (N1/N2 unack\'d): assess if intentional → add to ACKED_HOOK_GROUPS or ENTRYPOINT_PATTERN_PAIRS in this script');
  }
}

try { main(); } catch (err) {
  console.error(`namespace-check error: ${err.message}`);
  process.exit(1);
}
