#!/usr/bin/env bash
# setup-claude.sh — 将 claude-triple-system submodule 链接到项目 .claude/ 目录
#
# 用法（在新项目根目录执行）：
#   git submodule add <repo-url> .claude-system
#   bash .claude-system/setup-claude.sh
#
# 重新链接（幂等）：
#   bash .claude-system/setup-claude.sh
#
# 更新框架到最新版：
#   git submodule update --remote .claude-system && bash .claude-system/setup-claude.sh
#   # 或（如果有 install.sh）：
#   bash .claude-system/install.sh --update

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 如果脚本就在项目根目录（非 submodule 场景），调整路径
if [ "$SCRIPT_DIR" = "$PROJECT_ROOT" ]; then
  echo "⚠ 请将本仓库作为 submodule 添加到目标项目，而非直接在本仓库运行。"
  echo "  用法: git submodule add <repo-url> .claude-system"
  echo "        bash .claude-system/setup-claude.sh"
  exit 1
fi

FRAMEWORK_CLAUDE="$SCRIPT_DIR/.claude"
TARGET_CLAUDE="$PROJECT_ROOT/.claude"

# 检测 .claude 是否已经直接 symlink 到框架的 .claude 目录
# 这种情况下不需要创建子目录的 symlink，否则会产生自引用循环
if [ -L "$TARGET_CLAUDE" ]; then
  TARGET_REAL="$(readlink -f "$TARGET_CLAUDE")"
  FRAMEWORK_REAL="$(readlink -f "$FRAMEWORK_CLAUDE")"
  if [ "$TARGET_REAL" = "$FRAMEWORK_REAL" ]; then
    echo "=== Claude Triple-System Setup ==="
    echo "检测到 $TARGET_CLAUDE 已直接链接到 $FRAMEWORK_CLAUDE"
    echo "无需额外操作，所有内容已通过顶层 symlink 自动可用。"
    echo ""
    echo "如需本地状态目录，请确保以下目录存在："
    for dir in memory sessions shared-state; do
      dest="$FRAMEWORK_CLAUDE/$dir"
      if [ ! -d "$dest" ]; then
        mkdir -p "$dest"
        echo "  + $dir (已创建)"
      else
        echo "  ✓ $dir (已存在)"
      fi
    done
    echo ""
    echo "=== 完成（顶层 symlink 模式）==="
    exit 0
  fi
fi

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

# 链接框架 CLAUDE.md 到 .claude/CLAUDE.md（分层生效，不与项目根目录的 CLAUDE.md 冲突）
# Claude Code 会自动加载项目根目录和 .claude/ 子目录下的所有 CLAUDE.md
CLAUDEMD_SRC="$FRAMEWORK_CLAUDE/CLAUDE.md"
CLAUDEMD_DEST="$TARGET_CLAUDE/CLAUDE.md"
if [ -f "$CLAUDEMD_SRC" ] || [ -L "$CLAUDEMD_SRC" ]; then
  if [ -L "$CLAUDEMD_DEST" ] && [ "$(readlink -f "$CLAUDEMD_DEST")" = "$(readlink -f "$CLAUDEMD_SRC")" ]; then
    echo "  ✓ .claude/CLAUDE.md (已链接)"
  elif [ -f "$CLAUDEMD_DEST" ]; then
    backup="$CLAUDEMD_DEST.backup.$(date +%s)"
    echo "  ⚠ .claude/CLAUDE.md 已存在，备份到 ${backup##*/}"
    mv "$CLAUDEMD_DEST" "$backup"
    ln -s "$CLAUDEMD_SRC" "$CLAUDEMD_DEST"
    echo "  → .claude/CLAUDE.md (已链接)"
  else
    ln -s "$CLAUDEMD_SRC" "$CLAUDEMD_DEST"
    echo "  → .claude/CLAUDE.md (已链接)"
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
echo "  2. 提交 .claude/settings.json（框架 CLAUDE.md 通过 symlink 自动生效）"
echo "  3. 更新框架: git submodule update --remote .claude-system && bash .claude-system/setup-claude.sh"
