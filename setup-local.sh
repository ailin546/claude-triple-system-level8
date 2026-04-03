#!/usr/bin/env bash
# setup-local.sh — 将 Triple-System 框架安装为本地 Claude Code 工作流
#
# 用法（在本仓库根目录执行）：
#   bash setup-local.sh
#
# 做的事情：
#   1. 备份现有 ~/.claude/settings.json
#   2. 写入完整 hooks + 权限配置
#   3. 初始化记忆目录 (~/.memory/ 和 .memory/)
#   4. 初始化运行时目录 (.claude/logs/, .claude/.drift-state/, etc.)
#   5. 验证 hook 脚本完整性

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR/.claude/scripts/hooks"
USER_CLAUDE_DIR="${HOME}/.claude"
USER_SETTINGS="$USER_CLAUDE_DIR/settings.json"
GLOBAL_MEMORY="${HOME}/.memory"
PROJECT_MEMORY="$SCRIPT_DIR/.memory"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Claude Triple-System — 本地工作流安装               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "项目目录: $SCRIPT_DIR"
echo "用户配置: $USER_SETTINGS"
echo ""

# ── Step 0: 前置检查 ──
echo "🔍 [0/5] 前置检查..."

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
  cost-tracker.js suggest-compact.js session-end.js
  shared-state-sync.js sprint-memory.js memory-consolidate.js
  evaluate-session.js shared-memory-sync.js memory-promote.js
)
MISSING=0
for hook in "${REQUIRED_HOOKS[@]}"; do
  if [ ! -f "$HOOKS_DIR/$hook" ]; then
    echo "  ❌ 缺失: $hook"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "  ⚠ 部分 hook 脚本缺失，继续安装但相关功能将降级"
else
  echo "  ✓ 所有 hook 脚本完整 (${#REQUIRED_HOOKS[@]} 个)"
fi

# ── Step 1: 备份现有配置 ──
echo ""
echo "💾 [1/5] 备份现有配置..."

mkdir -p "$USER_CLAUDE_DIR/backups"
if [ -f "$USER_SETTINGS" ]; then
  BACKUP="$USER_CLAUDE_DIR/backups/settings.json.$(date +%Y%m%d-%H%M%S)"
  cp "$USER_SETTINGS" "$BACKUP"
  echo "  → 已备份到 $BACKUP"
else
  echo "  ✓ 无现有配置需要备份"
fi

# ── Step 2: 写入 hooks + 权限配置 ──
echo ""
echo "⚙️  [2/5] 写入 hooks + 权限配置..."

# 用 node 生成 JSON 避免 heredoc 转义问题
node -e '
const path = require("path");
const fs = require("fs");

const hooksDir = process.argv[1];
const settingsPath = process.argv[2];

// Helper: construct hook command
function h(script, opts = {}) {
  const cmd = `node "${hooksDir}/${script}"`;
  const entry = { type: "command", command: cmd };
  if (opts.timeout) entry.timeout = opts.timeout;
  return entry;
}

const settings = {
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    // ── SessionStart ──
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [h("session-start.js", { timeout: 10 })],
        "description": "[Always-on] 加载上次会话上下文"
      },
      {
        "matcher": "",
        "hooks": [h("task-router.js", { timeout: 5 })],
        "description": "[Always-on] 重置模式为 fast，清空 escalation-state"
      }
    ],
    // ── PreToolUse ──
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [h("careful-guard.js", { timeout: 5 })],
        "description": "[Always-on] 拦截破坏性命令"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("freeze-guard.js", { timeout: 5 })],
        "description": "[Always-on] 编辑范围冻结守卫"
      },
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [h("pre-tool-escalate.js", { timeout: 5 })],
        "description": "[Always-on] 风险信号升档 + 跨文件累积追踪"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("suggest-compact.js", { timeout: 5 })],
        "description": "[Standard+] 压缩建议"
      }
    ],
    // ── PostToolUse ──
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [h("post-edit-light.js", { timeout: 10 })],
        "description": "[Always-on] 轻量格式化 + console.log 警告"
      },
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [h("drift-detector.js", { timeout: 5 })],
        "description": "[Standard+] 漂移检测"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("quality-gate.js", { timeout: 15 })],
        "description": "[Standard+] 局部质量门"
      },
      {
        "matcher": "Edit",
        "hooks": [h("post-edit-typecheck.js", { timeout: 30 })],
        "description": "[Standard+] TS 类型检查"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [h("fault-hint.js", { timeout: 5 })],
        "description": "[Standard+] 容错提示"
      }
    ],
    // ── PreCompact ──
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [h("pre-compact.js", { timeout: 10 })],
        "description": "[Always-on] 压缩前保存状态"
      }
    ],
    // ── Stop ──
    "Stop": [
      {
        "matcher": "",
        "hooks": [h("stop-summary.js", { timeout: 15 })],
        "description": "[Always-on] today.md 轮转 + index 更新 + 错误教训沉淀"
      },
      {
        "matcher": "",
        "hooks": [h("cost-tracker.js", { timeout: 10 })],
        "description": "[Standard+] 成本追踪"
      },
      {
        "matcher": "",
        "hooks": [h("session-end.js", { timeout: 10 })],
        "description": "[Standard+] 持久化会话状态"
      },
      {
        "matcher": "",
        "hooks": [h("shared-state-sync.js", { timeout: 10 })],
        "description": "[Heavy] 任务板维护"
      },
      {
        "matcher": "",
        "hooks": [h("sprint-memory.js", { timeout: 10 })],
        "description": "[Heavy] 跨会话目标记录"
      },
      {
        "matcher": "",
        "hooks": [h("memory-consolidate.js", { timeout: 10 })],
        "description": "[Heavy] 长期记忆沉淀"
      },
      {
        "matcher": "",
        "hooks": [h("evaluate-session.js", { timeout: 10 })],
        "description": "[Heavy] 提取可复用模式"
      },
      {
        "matcher": "",
        "hooks": [h("shared-memory-sync.js", { timeout: 15 })],
        "description": "[Heavy] 跨工具共享记忆同步"
      },
      {
        "matcher": "",
        "hooks": [h("memory-promote.js", { timeout: 10 })],
        "description": "[Heavy] ECC instinct 推广"
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(*)",
      "Edit(*)",
      "Write(*)",
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "WebSearch(*)",
      "WebFetch(*)",
      "TodoWrite(*)",
      "Agent(*)",
      "Skill(*)",
      "NotebookEdit(*)",
      "mcp__github__*"
    ]
  }
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log("  ✓ settings.json 已写入");
' "$HOOKS_DIR" "$USER_SETTINGS"

# ── Step 3: 初始化记忆目录 ──
echo ""
echo "🧠 [3/5] 初始化记忆目录..."

# 全局记忆
mkdir -p "$GLOBAL_MEMORY"
for f in index.md today.md long-term.md; do
  if [ ! -f "$GLOBAL_MEMORY/$f" ]; then
    if [ "$f" = "index.md" ]; then
      echo "# Memory Index" > "$GLOBAL_MEMORY/$f"
      echo "" >> "$GLOBAL_MEMORY/$f"
      echo "> 由 stop-summary.js hook 自动维护" >> "$GLOBAL_MEMORY/$f"
    elif [ "$f" = "today.md" ]; then
      echo "# Today — $(date +%Y-%m-%d)" > "$GLOBAL_MEMORY/$f"
      echo "" >> "$GLOBAL_MEMORY/$f"
      echo "## Sessions" >> "$GLOBAL_MEMORY/$f"
    elif [ "$f" = "long-term.md" ]; then
      echo "# Long-term Memory" > "$GLOBAL_MEMORY/$f"
      echo "" >> "$GLOBAL_MEMORY/$f"
      echo "> 跨项目永久知识" >> "$GLOBAL_MEMORY/$f"
    fi
    echo "  + ~/.memory/$f (已创建)"
  else
    echo "  ✓ ~/.memory/$f (已存在)"
  fi
done

# 项目记忆
mkdir -p "$PROJECT_MEMORY"
for f in today.md weekly.md long-term.md; do
  if [ ! -f "$PROJECT_MEMORY/$f" ]; then
    if [ "$f" = "today.md" ]; then
      echo "# Today — $(date +%Y-%m-%d)" > "$PROJECT_MEMORY/$f"
      echo "" >> "$PROJECT_MEMORY/$f"
      echo "## Sessions" >> "$PROJECT_MEMORY/$f"
    elif [ "$f" = "weekly.md" ]; then
      echo "# Weekly Memory" > "$PROJECT_MEMORY/$f"
    elif [ "$f" = "long-term.md" ]; then
      echo "# Long-term Memory" > "$PROJECT_MEMORY/$f"
    fi
    echo "  + .memory/$f (已创建)"
  else
    echo "  ✓ .memory/$f (已存在)"
  fi
done

# ── Step 4: 初始化运行时目录 ──
echo ""
echo "📁 [4/5] 初始化运行时目录..."

# Logs
mkdir -p "$SCRIPT_DIR/.claude/logs"
echo "  ✓ .claude/logs/"

# Drift state
mkdir -p "$SCRIPT_DIR/.claude/.drift-state"
echo "  ✓ .claude/.drift-state/"

# Shared state
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

# Memory (claude internal)
mkdir -p "$SCRIPT_DIR/.claude/memory"
echo "  ✓ .claude/memory/"

# Sessions
mkdir -p "$USER_CLAUDE_DIR/sessions"
echo "  ✓ ~/.claude/sessions/"

# Mode file (default fast)
echo "fast" > "$SCRIPT_DIR/.claude/.task-mode"
echo "  ✓ .claude/.task-mode (fast)"

# ── Step 5: 验证 ──
echo ""
echo "✅ [5/5] 验证安装..."

# Test a hook can run
if node "$HOOKS_DIR/set-mode.js" fast 2>/dev/null; then
  echo "  ✓ Hook 脚本可正常执行"
else
  echo "  ⚠ set-mode.js 执行失败，hook 可能需要调试"
fi

# Verify settings.json is valid JSON
if node -e "JSON.parse(require('fs').readFileSync('$USER_SETTINGS','utf8'))" 2>/dev/null; then
  echo "  ✓ settings.json 格式正确"
else
  echo "  ❌ settings.json 格式错误！"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ 安装完成！                                       ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  已配置：                                            ║"
echo "║    • ~/.claude/settings.json — hooks + 全权限        ║"
echo "║    • ~/.memory/ — 全局记忆目录                        ║"
echo "║    • .memory/ — 项目记忆目录                          ║"
echo "║    • .claude/logs/ — 模式追踪日志                     ║"
echo "║    • .claude/.drift-state/ — 漂移检测状态             ║"
echo "║    • .claude/shared-state/ — 多 agent 协作状态        ║"
echo "║                                                      ║"
echo "║  工作流：                                             ║"
echo "║    Fast:     直接做 → /verify                        ║"
echo "║    Standard: /plan → 实施 → /verify                  ║"
echo "║    Heavy:    /plan → /tdd → 实施 → /code-review      ║"
echo "║                                                      ║"
echo "║  常用命令：                                           ║"
echo "║    /plan  /tdd  /verify  /code-review  /build-fix    ║"
echo "║    /careful  /freeze  /save-session  /resume-session ║"
echo "║                                                      ║"
echo "║  备份位置: ~/.claude/backups/                         ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
