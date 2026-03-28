#!/usr/bin/env bash
# memory-init.sh — 初始化 .memory/ 为独立 git 仓库，实现多设备/多 AI 共享
#
# 用法：
#   bash .claude/scripts/memory-init.sh <remote-url>
#   bash .claude/scripts/memory-init.sh git@github.com:你的用户名/claude-memory.git
#
# 做的事情：
#   1. 保存 remote URL 到 .claude/.memory-remote
#   2. 如果远程仓库已有内容 → 克隆到 .memory/
#   3. 如果远程仓库为空 → 初始化 .memory/ 并推送
#   4. 确保 .gitignore 排除 .memory/
#   5. 保留已有的本地记忆文件

set -euo pipefail

REMOTE_URL="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MEMORY_DIR="$PROJECT_ROOT/.memory"
REMOTE_FILE="$PROJECT_ROOT/.claude/.memory-remote"

if [ -z "$REMOTE_URL" ]; then
  echo "用法: bash .claude/scripts/memory-init.sh <remote-url>"
  echo ""
  echo "示例:"
  echo "  bash .claude/scripts/memory-init.sh git@github.com:你的用户名/claude-memory.git"
  echo "  bash .claude/scripts/memory-init.sh https://github.com/你的用户名/claude-memory.git"
  echo ""
  echo "提示: 先在 GitHub 上创建一个空仓库（不要初始化 README）"
  exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  Memory Repo 初始化                          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "远程地址: $REMOTE_URL"
echo "本地路径: $MEMORY_DIR"
echo ""

# ── Step 1: 保存 remote URL ──
echo "[1/4] 保存远程地址..."
mkdir -p "$(dirname "$REMOTE_FILE")"
echo "$REMOTE_URL" > "$REMOTE_FILE"
echo "  → 已写入 $REMOTE_FILE"

# ── Step 2: 备份本地文件 ──
echo "[2/4] 备份现有记忆文件..."
BACKUP_DIR="$MEMORY_DIR.init-backup"
if [ -d "$MEMORY_DIR" ]; then
  cp -r "$MEMORY_DIR" "$BACKUP_DIR"
  echo "  → 备份到 $BACKUP_DIR"
else
  echo "  → 无现有文件，跳过"
fi

# ── Step 3: 初始化 git 仓库 ──
echo "[3/4] 初始化 git 仓库..."

if [ -d "$MEMORY_DIR/.git" ]; then
  echo "  → .memory/ 已是 git 仓库"
  cd "$MEMORY_DIR"

  # 更新 remote
  CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ "$CURRENT_REMOTE" != "$REMOTE_URL" ]; then
    if [ -n "$CURRENT_REMOTE" ]; then
      git remote set-url origin "$REMOTE_URL"
      echo "  → 更新 remote: $REMOTE_URL"
    else
      git remote add origin "$REMOTE_URL"
      echo "  → 添加 remote: $REMOTE_URL"
    fi
  fi
else
  # 尝试 clone
  if git clone "$REMOTE_URL" "$MEMORY_DIR.clone" 2>/dev/null; then
    echo "  → 从远程克隆成功"

    # 移动克隆的内容到 .memory/
    rm -rf "$MEMORY_DIR"
    mv "$MEMORY_DIR.clone" "$MEMORY_DIR"

    # 恢复本地独有的文件
    if [ -d "$BACKUP_DIR" ]; then
      for f in "$BACKUP_DIR"/*.md; do
        [ -f "$f" ] || continue
        basename="$(basename "$f")"
        if [ ! -f "$MEMORY_DIR/$basename" ]; then
          cp "$f" "$MEMORY_DIR/$basename"
          echo "  → 恢复本地文件: $basename"
        fi
      done
    fi
  else
    echo "  → 远程仓库为空或不可达，初始化新仓库"
    rm -rf "$MEMORY_DIR.clone" 2>/dev/null || true

    # 恢复备份
    if [ -d "$BACKUP_DIR" ]; then
      rm -rf "$MEMORY_DIR"
      mv "$BACKUP_DIR" "$MEMORY_DIR"
    fi

    mkdir -p "$MEMORY_DIR"
    cd "$MEMORY_DIR"
    git init
    git remote add origin "$REMOTE_URL"

    # 确保有基础文件
    if [ ! -f RULES.md ] && [ -f "$PROJECT_ROOT/.memory/RULES.md" ]; then
      cp "$PROJECT_ROOT/.memory/RULES.md" RULES.md 2>/dev/null || true
    fi

    # 创建模板文件（如果不存在）
    [ -f RULES.md ] || echo "# Shared Memory Rules" > RULES.md
    [ -f today.md ] || echo "# Today — $(date +%Y-%m-%d)" > today.md
    [ -f weekly.md ] || echo "# Weekly Summary" > weekly.md
    [ -f long-term.md ] || echo "# Long-Term Knowledge" > long-term.md

    git add -A
    git commit -m "init: shared memory repo"

    # 推送到远程
    if git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null; then
      echo "  → 已推送到远程"
    else
      echo "  ⚠ 推送失败，请检查远程仓库权限"
    fi
  fi
fi

# 清理备份
rm -rf "$BACKUP_DIR" 2>/dev/null || true

# ── Step 4: 确保 .gitignore 排除 .memory/ ──
echo "[4/4] 检查 .gitignore..."
GITIGNORE="$PROJECT_ROOT/.gitignore"
if ! grep -q "^\.memory/$" "$GITIGNORE" 2>/dev/null; then
  # 替换单个文件排除为整个目录排除
  if grep -q "\.memory/" "$GITIGNORE" 2>/dev/null; then
    echo "  → .gitignore 已包含 .memory/ 相关规则"
  else
    echo ".memory/" >> "$GITIGNORE"
    echo "  → 已添加 .memory/ 到 .gitignore"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ 初始化完成！                              ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  自动同步已启用：                              ║"
echo "║    会话启动 → 自动拉取最新记忆                 ║"
echo "║    会话结束 → 自动推送记忆变更                 ║"
echo "║                                              ║"
echo "║  其他设备使用同一仓库：                        ║"
echo "║    bash .claude/scripts/memory-init.sh \\     ║"
echo "║      $REMOTE_URL"
echo "║                                              ║"
echo "║  手动操作（通常不需要）：                       ║"
echo "║    cd .memory && git pull                    ║"
echo "║    cd .memory && git push                    ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
