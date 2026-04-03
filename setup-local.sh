#!/usr/bin/env bash
# setup-local.sh — 将 Triple-System 框架安装为本地 Claude Code 工作流
#
# 用法（在本仓库根目录执行）：
#   bash setup-local.sh
#
# 做的事情：
#   1. 将 hook 脚本 + lib 复制到 ~/.claude/scripts/hooks/（全局生效）
#   2. 备份并写入 ~/.claude/settings.json（hooks 指向全局路径）
#   3. 初始化记忆目录 (~/.memory/ 和 .memory/)
#   4. 初始化运行时目录
#   5. 验证安装

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_HOOKS="$SCRIPT_DIR/.claude/scripts/hooks"
SRC_LIB="$SCRIPT_DIR/.claude/scripts/lib"
USER_CLAUDE_DIR="${HOME}/.claude"
GLOBAL_HOOKS="$USER_CLAUDE_DIR/scripts/hooks"
GLOBAL_LIB="$USER_CLAUDE_DIR/scripts/lib"
USER_SETTINGS="$USER_CLAUDE_DIR/settings.json"
GLOBAL_MEMORY="${HOME}/.memory"
PROJECT_MEMORY="$SCRIPT_DIR/.memory"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Claude Triple-System — 本地工作流安装               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "框架源:   $SCRIPT_DIR"
echo "全局安装: $GLOBAL_HOOKS"
echo "用户配置: $USER_SETTINGS"
echo ""

# ── Step 0: 前置检查 ──
echo "🔍 [0/6] 前置检查..."

if ! command -v node &>/dev/null; then
  echo "  ❌ 未找到 node，请先安装 Node.js (>=18)"
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# 检查关键 hook 脚本
REQUIRED_HOOKS=(
  session-start.js task-router.js careful-guard.js freeze-guard.js
  pre-tool-escalate.js post-edit-light.js stop-summary.js pre-compact.js
  drift-detector.js quality-gate.js post-edit-typecheck.js fault-hint.js
  cost-tracker.js suggest-compact.js session-end.js set-mode.js
  shared-state-sync.js sprint-memory.js memory-consolidate.js
  evaluate-session.js shared-memory-sync.js memory-promote.js
)
MISSING=0
for hook in "${REQUIRED_HOOKS[@]}"; do
  if [ ! -f "$SRC_HOOKS/$hook" ]; then
    echo "  ❌ 缺失: $hook"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "  ⚠ 部分 hook 脚本缺失，继续安装但相关功能将降级"
else
  echo "  ✓ 所有 hook 脚本完整 (${#REQUIRED_HOOKS[@]} 个)"
fi

# ── Step 1: 复制 hook 脚本到全局目录 ──
echo ""
echo "📦 [1/6] 复制 hook 脚本到 ~/.claude/scripts/..."

mkdir -p "$GLOBAL_HOOKS"
mkdir -p "$GLOBAL_LIB"

# 复制所有 hook 脚本
COPIED=0
for f in "$SRC_HOOKS"/*.js; do
  [ -f "$f" ] || continue
  cp "$f" "$GLOBAL_HOOKS/"
  COPIED=$((COPIED + 1))
done
echo "  ✓ hooks: $COPIED 个脚本已复制"

# 复制辅助文件（fault-scenarios 等）
for f in "$SRC_HOOKS"/*.json; do
  [ -f "$f" ] || continue
  cp "$f" "$GLOBAL_HOOKS/"
done

# 复制 lib 目录
LIB_COPIED=0
if [ -d "$SRC_LIB" ]; then
  for f in "$SRC_LIB"/*.js; do
    [ -f "$f" ] || continue
    cp "$f" "$GLOBAL_LIB/"
    LIB_COPIED=$((LIB_COPIED + 1))
  done
fi
echo "  ✓ lib: $LIB_COPIED 个模块已复制"

# ── Step 2: 备份并写入 settings.json ──
echo ""
echo "💾 [2/6] 备份并写入 settings.json..."

mkdir -p "$USER_CLAUDE_DIR/backups"
if [ -f "$USER_SETTINGS" ]; then
  BACKUP="$USER_CLAUDE_DIR/backups/settings.json.$(date +%Y%m%d-%H%M%S)"
  cp "$USER_SETTINGS" "$BACKUP"
  echo "  → 已备份到 $BACKUP"
fi

# 用 node 生成 JSON，hooks 路径使用 ~/.claude/scripts/hooks/
node -e '
const fs = require("fs");
const path = require("path");

const homeDir = process.argv[1];
const settingsPath = process.argv[2];
const existingSettingsPath = process.argv[3];

// Use ~ for portability in display, but actual home path for execution
const hooksDir = path.join(homeDir, ".claude", "scripts", "hooks");

// Helper: construct hook command
function h(script, opts = {}) {
  const cmd = `node "${hooksDir}/${script}"`;
  const entry = { type: "command", command: cmd };
  if (opts.timeout) entry.timeout = opts.timeout;
  return entry;
}

// Try to preserve existing non-hook settings (e.g. custom permissions)
let existingPerms = [];
try {
  const existing = JSON.parse(fs.readFileSync(existingSettingsPath, "utf8"));
  if (existing.permissions && existing.permissions.allow) {
    existingPerms = existing.permissions.allow;
  }
} catch (e) {}

// Merge permissions: our defaults + any existing custom ones
const defaultPerms = [
  "Bash(*)", "Edit(*)", "Write(*)", "Read(*)", "Glob(*)", "Grep(*)",
  "WebSearch(*)", "WebFetch(*)", "TodoWrite(*)", "Agent(*)", "Skill(*)",
  "NotebookEdit(*)", "mcp__github__*"
];
const allPerms = [...new Set([...defaultPerms, ...existingPerms])];

const settings = {
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [h("session-start.js", { timeout: 10 })],
        "description": "[Always-on] Load previous session context"
      },
      {
        "matcher": "",
        "hooks": [h("task-router.js", { timeout: 5 })],
        "description": "[Always-on] Reset mode to fast, clear escalation state"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [h("careful-guard.js", { timeout: 5 })],
        "description": "[Always-on] Block destructive commands"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("freeze-guard.js", { timeout: 5 })],
        "description": "[Always-on] Edit scope freeze guard"
      },
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [h("pre-tool-escalate.js", { timeout: 5 })],
        "description": "[Always-on] Risk signal escalation + cross-file tracking"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("suggest-compact.js", { timeout: 5 })],
        "description": "[Standard+] Compaction suggestion"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [h("post-edit-light.js", { timeout: 10 })],
        "description": "[Always-on] Lightweight formatting + console.log warning"
      },
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [h("drift-detector.js", { timeout: 5 })],
        "description": "[Standard+] Drift detection"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("quality-gate.js", { timeout: 15 })],
        "description": "[Standard+] Local quality gate"
      },
      {
        "matcher": "Edit",
        "hooks": [h("post-edit-typecheck.js", { timeout: 30 })],
        "description": "[Standard+] TypeScript type check"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("fault-hint.js", { timeout: 5 })],
        "description": "[Standard+] Fault tolerance hint"
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [h("pre-compact.js", { timeout: 10 })],
        "description": "[Always-on] Save state before compaction"
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [h("stop-summary.js", { timeout: 15 })],
        "description": "[Always-on] today.md rotation + index update + lessons"
      },
      {
        "matcher": "",
        "hooks": [h("cost-tracker.js", { timeout: 10 })],
        "description": "[Standard+] Cost tracking"
      },
      {
        "matcher": "",
        "hooks": [h("session-end.js", { timeout: 10 })],
        "description": "[Standard+] Persist session state"
      },
      {
        "matcher": "",
        "hooks": [h("shared-state-sync.js", { timeout: 10 })],
        "description": "[Heavy] Task board sync"
      },
      {
        "matcher": "",
        "hooks": [h("sprint-memory.js", { timeout: 10 })],
        "description": "[Heavy] Cross-session goal tracking"
      },
      {
        "matcher": "",
        "hooks": [h("memory-consolidate.js", { timeout: 10 })],
        "description": "[Heavy] Long-term memory consolidation"
      },
      {
        "matcher": "",
        "hooks": [h("evaluate-session.js", { timeout: 10 })],
        "description": "[Heavy] Extract reusable patterns"
      },
      {
        "matcher": "",
        "hooks": [h("shared-memory-sync.js", { timeout: 15 })],
        "description": "[Heavy] Cross-tool shared memory sync"
      },
      {
        "matcher": "",
        "hooks": [h("memory-promote.js", { timeout: 10 })],
        "description": "[Heavy] ECC instinct promotion"
      }
    ]
  },
  "permissions": {
    "allow": allPerms
  }
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log("  ✓ settings.json 已写入 (hooks 指向 ~/.claude/scripts/hooks/)");
' "$HOME" "$USER_SETTINGS" "$USER_SETTINGS"

# ── Step 3: 初始化记忆目录 ──
echo ""
echo "🧠 [3/6] 初始化记忆目录..."

# 全局记忆（不覆盖已有文件）
mkdir -p "$GLOBAL_MEMORY"
for f in index.md today.md long-term.md; do
  if [ ! -f "$GLOBAL_MEMORY/$f" ]; then
    if [ "$f" = "index.md" ]; then
      printf "# Memory Index\n\n> 由 stop-summary.js hook 自动维护\n" > "$GLOBAL_MEMORY/$f"
    elif [ "$f" = "today.md" ]; then
      printf "# Today — %s\n\n## Sessions\n" "$(date +%Y-%m-%d)" > "$GLOBAL_MEMORY/$f"
    elif [ "$f" = "long-term.md" ]; then
      printf "# Long-term Memory\n\n> 跨项目永久知识\n" > "$GLOBAL_MEMORY/$f"
    fi
    echo "  + ~/.memory/$f (已创建)"
  else
    echo "  ✓ ~/.memory/$f (已存在，保留)"
  fi
done

# 项目记忆（不覆盖已有文件）
mkdir -p "$PROJECT_MEMORY"
for f in today.md weekly.md long-term.md; do
  if [ ! -f "$PROJECT_MEMORY/$f" ]; then
    if [ "$f" = "today.md" ]; then
      printf "# Today — %s\n\n## Sessions\n" "$(date +%Y-%m-%d)" > "$PROJECT_MEMORY/$f"
    elif [ "$f" = "weekly.md" ]; then
      printf "# Weekly Memory\n" > "$PROJECT_MEMORY/$f"
    elif [ "$f" = "long-term.md" ]; then
      printf "# Long-term Memory\n" > "$PROJECT_MEMORY/$f"
    fi
    echo "  + .memory/$f (已创建)"
  else
    echo "  ✓ .memory/$f (已存在，保留)"
  fi
done

# ── Step 4: 初始化运行时目录 ──
echo ""
echo "📁 [4/6] 初始化运行时目录..."

mkdir -p "$SCRIPT_DIR/.claude/logs"
echo "  ✓ .claude/logs/"

mkdir -p "$SCRIPT_DIR/.claude/.drift-state"
echo "  ✓ .claude/.drift-state/"

mkdir -p "$SCRIPT_DIR/.claude/shared-state/artifacts"
if [ ! -f "$SCRIPT_DIR/.claude/shared-state/board.json" ]; then
  echo '{"$schema":"shared-state-board","version":"1.0.0","tasks":[],"agents":[],"conflicts":[]}' \
    > "$SCRIPT_DIR/.claude/shared-state/board.json"
  echo "  + .claude/shared-state/board.json"
else
  echo "  ✓ .claude/shared-state/board.json"
fi

if [ ! -f "$SCRIPT_DIR/.claude/shared-state/decisions.log" ]; then
  echo "# Agent Decision Log" > "$SCRIPT_DIR/.claude/shared-state/decisions.log"
  echo "  + .claude/shared-state/decisions.log"
else
  echo "  ✓ .claude/shared-state/decisions.log"
fi

mkdir -p "$SCRIPT_DIR/.claude/memory"
echo "  ✓ .claude/memory/"

mkdir -p "$USER_CLAUDE_DIR/sessions"
echo "  ✓ ~/.claude/sessions/"

echo "fast" > "$SCRIPT_DIR/.claude/.task-mode"
echo "  ✓ .claude/.task-mode (fast)"

# ── Step 5: 为其他项目创建 submodule 安装指南 ──
echo ""
echo "📋 [5/6] 生成项目集成指南..."

cat > "$USER_CLAUDE_DIR/INSTALL-TO-PROJECT.md" << 'GUIDEEOF'
# 将 Triple-System 集成到其他项目

## 方式 1：Submodule（推荐，可跟随框架更新）

```bash
cd your-project
git submodule add https://github.com/ailin546/claude-triple-system-level8.git .claude-system
bash .claude-system/setup-claude.sh
```

## 方式 2：仅 CLAUDE.md + rules（轻量，无 hooks）

```bash
cd your-project
mkdir -p .claude/rules
cp ~/.claude/scripts/hooks/../../../claude-triple-system-level8/CLAUDE.md ./CLAUDE.md
cp -r ~/.claude/scripts/hooks/../../../claude-triple-system-level8/.claude/rules/* .claude/rules/
```

## hooks 已全局生效

hooks 脚本已安装到 ~/.claude/scripts/hooks/，所有项目共享。
每个项目只需要有自己的 CLAUDE.md 和 .claude/rules/ 即可。
GUIDEEOF
echo "  ✓ ~/.claude/INSTALL-TO-PROJECT.md"

# ── Step 6: 验证 ──
echo ""
echo "✅ [6/6] 验证安装..."

if node "$GLOBAL_HOOKS/set-mode.js" fast 2>/dev/null; then
  echo "  ✓ 全局 hook 脚本可正常执行"
else
  echo "  ⚠ set-mode.js 执行失败（可能需要 CLAUDE_PROJECT_ROOT）"
fi

if node -e "JSON.parse(require('fs').readFileSync('$USER_SETTINGS','utf8'))" 2>/dev/null; then
  echo "  ✓ settings.json 格式正确"
else
  echo "  ❌ settings.json 格式错误！"
  exit 1
fi

# 验证路径一致性
SAMPLE_CMD=$(node -e "const s=JSON.parse(require('fs').readFileSync('$USER_SETTINGS','utf8'));console.log(s.hooks.SessionStart[0].hooks[0].command)")
echo "  ✓ Hook 路径示例: $SAMPLE_CMD"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ 安装完成！                                           ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  全局生效（所有项目）：                                   ║"
echo "║    • ~/.claude/scripts/hooks/ — hook 脚本                ║"
echo "║    • ~/.claude/settings.json  — hooks + 权限配置          ║"
echo "║    • ~/.memory/               — 全局跨项目记忆            ║"
echo "║                                                          ║"
echo "║  项目级（当前项目）：                                     ║"
echo "║    • .memory/          — 项目记忆                        ║"
echo "║    • .claude/logs/     — 模式追踪日志                    ║"
echo "║    • .claude/shared-state/ — 多 agent 协作状态            ║"
echo "║                                                          ║"
echo "║  三档工作流（所有项目自动生效）：                          ║"
echo "║    Fast:     直接做 → /verify                            ║"
echo "║    Standard: /plan → 实施 → /verify                      ║"
echo "║    Heavy:    /plan → /tdd → 实施 → /code-review          ║"
echo "║                                                          ║"
echo "║  其他项目集成：                                           ║"
echo "║    cat ~/.claude/INSTALL-TO-PROJECT.md                   ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
