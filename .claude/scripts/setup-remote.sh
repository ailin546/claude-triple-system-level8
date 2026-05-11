#!/usr/bin/env bash
# setup-remote.sh — 任意机器一键安装 Claude Triple-System 框架
#
# 用法（在远程机器上执行）:
#   bash setup-remote.sh
#
# 或从 Mac 推送到远程机器:
#   ssh remote-host "bash -s" < ~/.claude/scripts/setup-remote.sh
#
# 做的事情:
#   1. 检测 node 和 gh CLI
#   2. 克隆框架 → ~/.claude/（agents/skills/commands/rules/scripts/...）
#   3. 克隆记忆 → ~/.memory/
#   4. 生成 settings.json（hooks + Agent Teams + 全权限）
#   5. 写入 host-id

set -euo pipefail

FRAMEWORK_REPO="ailin546/claude-triple-system-level8"
MEMORY_REPO="ailin546/memory"
CLAUDE_DIR="$HOME/.claude"
MEMORY_DIR="$HOME/.memory"
TMP_DIR="/tmp/claude-setup-$$"

echo "╔══════════════════════════════════════════════╗"
echo "║  Claude Triple-System 远程安装               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Host: $(hostname)"
echo "  User: $(whoami)"
echo "  Home: $HOME"
echo ""

# ── 1. 检测依赖 ──────────────────────────────────────────

echo "📋 [1/5] 检测依赖..."

# Node.js
if command -v node &>/dev/null; then
  echo "  ✓ node $(node --version)"
else
  echo "  ✗ node 未找到"
  echo "    请安装 Node.js: https://nodejs.org/ 或 nvm"
  echo "    Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi

# gh CLI
if command -v gh &>/dev/null; then
  echo "  ✓ gh $(gh --version | head -1 | awk '{print $NF}')"
else
  echo "  ⚠ gh CLI 未找到，尝试安装..."
  if command -v apt &>/dev/null; then
    # Debian/Ubuntu
    (type -p wget >/dev/null || sudo apt install wget -y) \
      && sudo mkdir -p -m 755 /etc/apt/keyrings \
      && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
      && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
      && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
      && sudo apt update && sudo apt install gh -y
  elif command -v dnf &>/dev/null; then
    sudo dnf install gh -y
  elif command -v brew &>/dev/null; then
    brew install gh
  else
    echo "    请手动安装 gh: https://cli.github.com/"
    exit 1
  fi
fi

# gh 认证
if ! gh auth status &>/dev/null; then
  echo "  ⚠ gh 未认证，请执行: gh auth login"
  exit 1
else
  echo "  ✓ gh 已认证"
fi

# Claude Code
if command -v claude &>/dev/null; then
  echo "  ✓ claude $(claude --version 2>/dev/null || echo 'installed')"
else
  echo "  ⚠ Claude Code 未安装"
  echo "    请安装: npm install -g @anthropic-ai/claude-code"
  echo "    继续安装框架（Claude Code 可稍后安装）..."
fi

# ── 2. 克隆框架 ──────────────────────────────────────────

echo ""
echo "📦 [2/5] 安装框架..."

mkdir -p "$TMP_DIR"
gh repo clone "$FRAMEWORK_REPO" "$TMP_DIR/framework" -- --depth 1 2>/dev/null || {
  echo "  ✗ 克隆框架仓库失败"
  exit 1
}

# 需要复制的目录
COPY_DIRS=(agents agents-archive best-practice commands commands-archive examples mcp-configs rules rules-all scripts skills skills-archive strategies)

mkdir -p "$CLAUDE_DIR"
for dir in "${COPY_DIRS[@]}"; do
  src="$TMP_DIR/framework/.claude/$dir"
  dest="$CLAUDE_DIR/$dir"
  if [ -d "$src" ]; then
    if [ -d "$dest" ]; then
      echo "  ↻ $dir (已存在，更新)"
      rm -rf "$dest"
    fi
    cp -r "$src" "$dest"
    echo "  → $dir"
  fi
done

# 创建本地状态目录
for dir in memory sessions shared-state/artifacts logs; do
  mkdir -p "$CLAUDE_DIR/$dir"
done

echo "  ✓ 框架安装完成 ($(ls "$CLAUDE_DIR/agents/" | wc -l) agents, $(ls "$CLAUDE_DIR/skills/" | wc -l) skills)"

# ── 3. 克隆记忆 ──────────────────────────────────────────

echo ""
echo "🧠 [3/5] 安装共享记忆..."

if [ -d "$MEMORY_DIR/.git" ]; then
  echo "  ✓ ~/.memory/ 已存在 (git repo)"
  cd "$MEMORY_DIR" && git pull --rebase origin main 2>/dev/null && cd - >/dev/null
  echo "  ↻ 已拉取最新"
else
  if [ -d "$MEMORY_DIR" ]; then
    mv "$MEMORY_DIR" "$MEMORY_DIR.backup-$(date +%s)"
    echo "  ⚠ 已备份旧 ~/.memory/"
  fi
  gh repo clone "$MEMORY_REPO" "$MEMORY_DIR" -- --depth 1 2>/dev/null || {
    echo "  ⚠ 克隆记忆仓库失败，创建空目录"
    mkdir -p "$MEMORY_DIR"
    for f in today.md weekly.md long-term.md; do touch "$MEMORY_DIR/$f"; done
  }
  echo "  ✓ 记忆仓库已克隆"
fi

# ── 4. 生成 settings.json ────────────────────────────────

echo ""
echo "⚙️  [4/5] 生成配置..."

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
  echo "  ⚠ settings.json 已存在，备份后覆盖"
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup-$(date +%s)"
fi

cat > "$SETTINGS_FILE" << 'SETTINGSEOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "extraKnownMarketplaces": {
    "claude-plugins-official": {
      "source": {
        "source": "github",
        "repo": "anthropics/claude-plugins-official"
      }
    }
  },
  "permissions": {
    "allow": ["*"]
  },
  "language": "chinese",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/careful-guard.js\"" }],
        "description": "Block dangerous commands"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/freeze-guard.js\"" }],
        "description": "Block edits to frozen files"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/suggest-compact.js\"" }],
        "description": "Suggest compaction at logical intervals"
      },
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/pre-tool-escalate.js\"" }],
        "description": "Auto-escalate mode on high-risk operations"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/quality-gate.js\"", "async": true, "timeout": 30 }],
        "description": "Quality gate checks after edits"
      },
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/post-edit-format.js\"" }],
        "description": "Auto-format after edits"
      },
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/post-edit-typecheck.js\"" }],
        "description": "TypeScript check after edits"
      },
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/drift-detector.js\"" }],
        "description": "Detect code drift"
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/stop-summary.js\"", "async": true, "timeout": 10 }],
        "description": "Session summary and memory sync"
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/session-end.js\"", "async": true, "timeout": 10 }],
        "description": "Persist session state"
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/cost-tracker.js\"", "async": true, "timeout": 10 }],
        "description": "Track token costs"
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/shared-state-sync.js\"", "async": true, "timeout": 10 }],
        "description": "Shared state sync"
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/sprint-memory.js\"", "async": true, "timeout": 10 }],
        "description": "Sprint memory"
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/pre-compact.js\"" }],
        "description": "Save state before compaction"
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/session-start.js\"" }],
        "description": "Load context and memory"
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"${HOME}/.claude/scripts/hooks/task-router.js\"" }],
        "description": "Initialize task mode"
      }
    ]
  }
}
SETTINGSEOF

echo "  ✓ settings.json (Agent Teams + 16 hooks + 全权限)"

# ── 5. 写入 host-id ─────────────────────────────────────

echo ""
echo "🏷  [5/5] 注册机器标识..."

echo "$(hostname)" > "$CLAUDE_DIR/.host-id"
echo "  ✓ host-id: $(hostname)"

# ── 清理 ─────────────────────────────────────────────────

rm -rf "$TMP_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ 安装完成！                                ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  下一步：                                     ║"
echo "║  1. 安装 Discord Channels 插件：              ║"
echo "║     claude 启动后执行：                       ║"
echo "║     /plugin install discord@claude-plugins-official  ║"
echo "║     /discord:configure YOUR_BOT_TOKEN        ║"
echo "║                                              ║"
echo "║  2. 启动 Claude Code：                        ║"
echo "║     claude --channels plugin:discord@claude-plugins-official  ║"
echo "║                                              ║"
echo "║  3. 验证框架：                                ║"
echo "║     claude 会话中输入 /verify                 ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
