#!/usr/bin/env bash
# setup-claude.sh — 将 claude-triple-system submodule 链接到项目 .claude/ 目录
#
# 用法（在新项目根目录执行）：
#   git submodule add <repo-url> .claude-framework
#   bash .claude-framework/setup-claude.sh
#
# 更新：
#   git submodule update --remote .claude-framework
#   bash .claude-framework/setup-claude.sh   # 重新链接（幂等）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 如果脚本就在项目根目录（非 submodule 场景），调整路径
if [ "$SCRIPT_DIR" = "$PROJECT_ROOT" ]; then
  echo "⚠ 请将本仓库作为 submodule 添加到目标项目，而非直接在本仓库运行。"
  echo "  用法: git submodule add <repo-url> .claude-framework"
  echo "        bash .claude-framework/setup-claude.sh"
  exit 1
fi

FRAMEWORK_CLAUDE="$SCRIPT_DIR/.claude"
TARGET_CLAUDE="$PROJECT_ROOT/.claude"

# ── 需要符号链接的目录（框架提供的静态内容）──
LINK_DIRS=(
  agents
  agents-archive
  best-practice
  commands
  commands-archive
  examples
  mcp-configs
  rules
  rules-all
  scripts
  skills
  skills-archive
  strategies
)

# ── 需要保留为本地真实目录（项目特有状态）──
LOCAL_DIRS=(
  memory
  sessions
  shared-state
)

echo "=== Claude Triple-System Setup ==="
echo "框架源:   $FRAMEWORK_CLAUDE"
echo "目标目录: $TARGET_CLAUDE"
echo ""

# 创建 .claude 目录
mkdir -p "$TARGET_CLAUDE"

# 链接静态内容目录
for dir in "${LINK_DIRS[@]}"; do
  src="$FRAMEWORK_CLAUDE/$dir"
  dest="$TARGET_CLAUDE/$dir"

  if [ ! -d "$src" ]; then
    continue  # 源目录不存在则跳过
  fi

  # 如果已存在且是正确的符号链接，跳过
  if [ -L "$dest" ] && [ "$(readlink -f "$dest")" = "$(readlink -f "$src")" ]; then
    echo "  ✓ $dir (已链接)"
    continue
  fi

  # 如果存在但不是符号链接，备份
  if [ -e "$dest" ]; then
    backup="$dest.backup.$(date +%s)"
    echo "  ⚠ $dir 已存在，备份到 ${backup##*/}"
    mv "$dest" "$backup"
  fi

  ln -s "$src" "$dest"
  echo "  → $dir (已链接)"
done

# 创建本地状态目录
for dir in "${LOCAL_DIRS[@]}"; do
  dest="$TARGET_CLAUDE/$dir"
  if [ -d "$dest" ] && [ ! -L "$dest" ]; then
    echo "  ✓ $dir (本地目录已存在)"
  else
    mkdir -p "$dest"
    echo "  + $dir (已创建本地目录)"
  fi
done

# 复制 settings.json（不覆盖已有的，因为项目可能有自定义配置）
SETTINGS_SRC="$FRAMEWORK_CLAUDE/settings.json"
SETTINGS_DEST="$TARGET_CLAUDE/settings.json"
if [ -f "$SETTINGS_SRC" ]; then
  if [ -f "$SETTINGS_DEST" ]; then
    echo "  ✓ settings.json (已存在，保留项目配置)"
  else
    cp "$SETTINGS_SRC" "$SETTINGS_DEST"
    echo "  + settings.json (已复制，可按需修改)"
  fi
fi

# 复制 CLAUDE.md 到项目根目录（不覆盖）
CLAUDEMD_SRC="$SCRIPT_DIR/CLAUDE.md"
CLAUDEMD_DEST="$PROJECT_ROOT/CLAUDE.md"
if [ -f "$CLAUDEMD_SRC" ]; then
  if [ -f "$CLAUDEMD_DEST" ]; then
    echo "  ✓ CLAUDE.md (已存在，保留项目配置)"
  else
    cp "$CLAUDEMD_SRC" "$CLAUDEMD_DEST"
    echo "  + CLAUDE.md (已复制到项目根目录)"
  fi
fi

echo ""
echo "=== 完成 ==="
echo ""
echo "后续步骤："
echo "  1. 将以下内容添加到项目 .gitignore："
echo "     .claude/memory/"
echo "     .claude/sessions/"
echo "     .claude/shared-state/"
echo "     .claude/.drift-state/"
echo "  2. 提交 .claude/settings.json 和 CLAUDE.md"
echo "  3. 更新框架: git submodule update --remote .claude-framework && bash .claude-framework/setup-claude.sh"
