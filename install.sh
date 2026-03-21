#!/usr/bin/env bash
# install.sh — 一键安装 Claude Triple-System 到任何项目
#
# 首次安装（在目标项目根目录执行）：
#   curl -sL <raw-url>/install.sh | bash -s -- <repo-url>
#   # 或者手动：
#   bash /path/to/install.sh <repo-url>
#
# 已有子模块时（克隆后初始化）：
#   bash .claude-system/install.sh
#
# 做的事情：
#   1. 如果子模块不存在 → git submodule add
#   2. git submodule update --init --recursive
#   3. 运行 setup-claude.sh 链接框架
#   4. 安装 git hook 实现后续自动化

set -euo pipefail

SUBMODULE_DIR=".claude-system"
REPO_URL="${1:-}"

# ── 检测运行位置 ──
if [ -f "$(dirname "$0")/setup-claude.sh" ]; then
  # 从子模块目录内运行
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  # 如果在框架仓库根目录运行（非子模块），提示用法
  if [ "$SCRIPT_DIR" = "$PROJECT_ROOT" ]; then
    if [ -z "$REPO_URL" ]; then
      echo "用法："
      echo "  cd <你的项目>"
      echo "  bash /path/to/install.sh <repo-url>"
      echo ""
      echo "或先添加子模块再运行："
      echo "  git submodule add <repo-url> .claude-system"
      echo "  bash .claude-system/install.sh"
      exit 1
    fi
    # 用户提供了 repo URL，切换到"首次安装"模式
    PROJECT_ROOT="$(pwd)"
  fi
else
  # 从外部运行（curl 管道等）
  PROJECT_ROOT="$(pwd)"
fi

cd "$PROJECT_ROOT"

echo "╔══════════════════════════════════════════════╗"
echo "║  Claude Triple-System 一键安装               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: 添加子模块（如果不存在）──
if [ ! -d "$SUBMODULE_DIR/.claude" ]; then
  if [ -z "$REPO_URL" ]; then
    # 检查 .gitmodules 里是否已注册
    if grep -q "$SUBMODULE_DIR" .gitmodules 2>/dev/null; then
      echo "📦 [1/4] 子模块已注册，初始化中..."
    else
      echo "❌ 未找到子模块且未提供仓库地址。"
      echo "   用法: bash install.sh <repo-url>"
      exit 1
    fi
  else
    echo "📦 [1/4] 添加子模块..."
    git submodule add "$REPO_URL" "$SUBMODULE_DIR" 2>/dev/null || true
  fi
else
  echo "📦 [1/4] 子模块已存在"
fi

# ── Step 2: 初始化并更新子模块 ──
echo "🔄 [2/4] 初始化子模块..."
git submodule update --init --recursive

# ── Step 3: 运行 setup ──
echo "🔗 [3/4] 链接框架到项目..."
echo ""
bash "$SUBMODULE_DIR/setup-claude.sh"

# ── Step 4: 安装 git hook（自动化后续更新）──
echo ""
echo "🪝 [4/4] 安装 git hook..."
HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="$HOOKS_DIR/post-checkout"

# 我们的标记，用于识别是否已安装
MARKER="# claude-triple-system-auto-setup"

install_hook() {
  local hook_path="$1"

  # 如果 hook 文件已存在且包含我们的标记，跳过
  if [ -f "$hook_path" ] && grep -q "$MARKER" "$hook_path" 2>/dev/null; then
    echo "  ✓ $(basename "$hook_path") hook 已安装"
    return
  fi

  # 如果 hook 文件已存在，追加；否则创建新文件
  if [ -f "$hook_path" ]; then
    echo "" >> "$hook_path"
    echo "$MARKER" >> "$hook_path"
  else
    echo "#!/usr/bin/env bash" > "$hook_path"
    echo "$MARKER" >> "$hook_path"
  fi

  cat >> "$hook_path" << 'HOOKEOF'
# Auto-setup Claude Triple-System after checkout/merge
if [ -f ".claude-system/setup-claude.sh" ]; then
  git submodule update --init --recursive 2>/dev/null
  bash .claude-system/setup-claude.sh 2>/dev/null
fi
HOOKEOF

  chmod +x "$hook_path"
  echo "  → $(basename "$hook_path") hook 已安装"
}

install_hook "$HOOKS_DIR/post-checkout"
install_hook "$HOOKS_DIR/post-merge"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ 安装完成！                                ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  已完成：                                     ║"
echo "║    1. 子模块初始化                            ║"
echo "║    2. 框架链接到 .claude/                     ║"
echo "║    3. git hook 自动化（后续免手动）            ║"
echo "║                                              ║"
echo "║  后续操作自动化：                              ║"
echo "║    git pull / git checkout → 自动重新链接     ║"
echo "║    团队成员 clone → 只需运行一次 install.sh   ║"
echo "║                                              ║"
echo "║  更新框架：                                   ║"
echo "║    git submodule update --remote .claude-system║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
