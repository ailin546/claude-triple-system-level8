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

# ── Step 4: 确保 .gitignore 排除 .memory/ 运行时数据 ──
echo "[4/6] 检查 .gitignore..."
GITIGNORE="$PROJECT_ROOT/.gitignore"
for pattern in ".memory/today.md" ".memory/weekly.md" ".memory/long-term.md" ".memory/.git/"; do
  if ! grep -qF "$pattern" "$GITIGNORE" 2>/dev/null; then
    echo "$pattern" >> "$GITIGNORE"
    echo "  → 已添加 $pattern 到 .gitignore"
  fi
done
echo "  ✓ .gitignore 已更新"

# ── Step 5: 配置 AI 工具使用共享记忆 ──
echo "[5/6] 配置 AI 工具..."

MEMORY_SNIPPET_CLAUDE='## 共享记忆
每次会话开始，按顺序读取 .memory/long-term.md → weekly.md → today.md。
每次会话结束，在 .memory/today.md 的 ## Sessions 下追加摘要。
格式：### [Claude Code] HH:MM，然后列出 Decisions/Constraints/Open loops。
只记录高价值信息，禁止流水账。详细规则见 .memory/RULES.md。'

MEMORY_SNIPPET_CURSOR='## 共享记忆
每次对话开始先读取 .memory/long-term.md、.memory/weekly.md、.memory/today.md，了解项目上下文。
每次对话结束在 .memory/today.md 的 ## Sessions 下追加：
### [Cursor] HH:MM
**Decisions:**
- 关键决策
**Open loops:**
- 未完成事项
只记录高价值信息（决策/约束/待办），禁止流水账。
如果 .memory/.git 存在，结束前执行：cd .memory && git add -A && git commit -m "memory: [Cursor]" && git pull --rebase origin main && git push origin main
详细规则见 .memory/RULES.md。'

MEMORY_SNIPPET_WINDSURF='## 共享记忆
每次对话开始先读取 .memory/long-term.md、.memory/weekly.md、.memory/today.md，了解项目上下文。
每次对话结束在 .memory/today.md 的 ## Sessions 下追加：
### [Windsurf] HH:MM
**Decisions:**
- 关键决策
**Open loops:**
- 未完成事项
只记录高价值信息（决策/约束/待办），禁止流水账。
如果 .memory/.git 存在，结束前执行：cd .memory && git add -A && git commit -m "memory: [Windsurf]" && git pull --rebase origin main && git push origin main
详细规则见 .memory/RULES.md。'

# 5a. CLAUDE.md
CLAUDEMD="$PROJECT_ROOT/CLAUDE.md"
if [ -f "$CLAUDEMD" ]; then
  if grep -q "共享记忆" "$CLAUDEMD" 2>/dev/null; then
    echo "  ✓ CLAUDE.md 已包含共享记忆配置"
  else
    echo "" >> "$CLAUDEMD"
    echo "$MEMORY_SNIPPET_CLAUDE" >> "$CLAUDEMD"
    echo "  → CLAUDE.md 已追加共享记忆配置"
  fi
else
  echo "$MEMORY_SNIPPET_CLAUDE" > "$CLAUDEMD"
  echo "  → 已创建 CLAUDE.md（含共享记忆配置）"
fi

# 5b. .cursorrules
CURSORRULES="$PROJECT_ROOT/.cursorrules"
if [ -f "$CURSORRULES" ]; then
  if grep -q "共享记忆" "$CURSORRULES" 2>/dev/null; then
    echo "  ✓ .cursorrules 已包含共享记忆配置"
  else
    echo "" >> "$CURSORRULES"
    echo "$MEMORY_SNIPPET_CURSOR" >> "$CURSORRULES"
    echo "  → .cursorrules 已追加共享记忆配置"
  fi
else
  echo "$MEMORY_SNIPPET_CURSOR" > "$CURSORRULES"
  echo "  → 已创建 .cursorrules（含共享记忆配置）"
fi

# 5c. .windsurfrules
WINDSURFRULES="$PROJECT_ROOT/.windsurfrules"
if [ -f "$WINDSURFRULES" ]; then
  if grep -q "共享记忆" "$WINDSURFRULES" 2>/dev/null; then
    echo "  ✓ .windsurfrules 已包含共享记忆配置"
  else
    echo "" >> "$WINDSURFRULES"
    echo "$MEMORY_SNIPPET_WINDSURF" >> "$WINDSURFRULES"
    echo "  → .windsurfrules 已追加共享记忆配置"
  fi
else
  echo "$MEMORY_SNIPPET_WINDSURF" > "$WINDSURFRULES"
  echo "  → 已创建 .windsurfrules（含共享记忆配置）"
fi

# 5d. Codex (AGENTS.md)
AGENTSMD="$PROJECT_ROOT/AGENTS.md"
MEMORY_SNIPPET_CODEX='## 共享记忆协议
每次会话开始，读取以下文件了解上下文：
1. .memory/long-term.md — 永久知识
2. .memory/weekly.md — 本周摘要
3. .memory/today.md — 今日工作

每次会话结束前，在 .memory/today.md 的 ## Sessions 下追加：
### [Codex] HH:MM
**Decisions:**
- 关键决策
**Open loops:**
- 未完成事项

只记录高价值信息（决策/约束/待办），禁止流水账。
如果 .memory/.git 存在，结束前执行：
cd .memory && git add -A && git commit -m "memory: $(date +%Y-%m-%d) [Codex]" && git pull --rebase origin main && git push origin main
详细规则见 .memory/RULES.md。'

if [ -f "$AGENTSMD" ]; then
  if grep -q "共享记忆" "$AGENTSMD" 2>/dev/null; then
    echo "  ✓ AGENTS.md 已包含共享记忆配置"
  else
    echo "" >> "$AGENTSMD"
    echo "$MEMORY_SNIPPET_CODEX" >> "$AGENTSMD"
    echo "  → AGENTS.md 已追加共享记忆配置（Codex 用）"
  fi
else
  echo "$MEMORY_SNIPPET_CODEX" > "$AGENTSMD"
  echo "  → 已创建 AGENTS.md（含共享记忆配置，Codex 用）"
fi

# 5e. OpenClaw (.openclaw/rules 或 .openclawrules)
OPENCLAWRULES="$PROJECT_ROOT/.openclawrules"
MEMORY_SNIPPET_OPENCLAW='## 共享记忆
每次会话开始先读取 .memory/long-term.md、.memory/weekly.md、.memory/today.md，了解项目上下文。
每次会话结束在 .memory/today.md 的 ## Sessions 下追加：
### [OpenClaw] HH:MM
**Decisions:**
- 关键决策
**Open loops:**
- 未完成事项
只记录高价值信息（决策/约束/待办），禁止流水账。
如果 .memory/.git 存在，结束前执行：cd .memory && git add -A && git commit -m "memory: [OpenClaw]" && git pull --rebase origin main && git push origin main
详细规则见 .memory/RULES.md。'

if [ -f "$OPENCLAWRULES" ]; then
  if grep -q "共享记忆" "$OPENCLAWRULES" 2>/dev/null; then
    echo "  ✓ .openclawrules 已包含共享记忆配置"
  else
    echo "" >> "$OPENCLAWRULES"
    echo "$MEMORY_SNIPPET_OPENCLAW" >> "$OPENCLAWRULES"
    echo "  → .openclawrules 已追加共享记忆配置"
  fi
else
  echo "$MEMORY_SNIPPET_OPENCLAW" > "$OPENCLAWRULES"
  echo "  → 已创建 .openclawrules（含共享记忆配置）"
fi

# ── Step 6: 保存配置 ──
echo "[6/6] 保存远程地址配置..."
echo "$REMOTE_URL" > "$REMOTE_FILE"
echo "  → $REMOTE_FILE"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ 初始化完成！                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  已配置的 AI 工具：                                       ║"
echo "║    Claude Code  → CLAUDE.md（Hook 自动同步）              ║"
echo "║    Cursor       → .cursorrules                           ║"
echo "║    Windsurf     → .windsurfrules                         ║"
echo "║    Codex        → AGENTS.md                              ║"
echo "║    OpenClaw     → .openclawrules                         ║"
echo "║                                                          ║"
echo "║  自动同步（Claude Code）：                                ║"
echo "║    会话启动 → git pull（拉取最新记忆）                     ║"
echo "║    会话结束 → git commit + push（推送变更）                ║"
echo "║                                                          ║"
echo "║  其他工具需在各自会话结束时手动执行：                       ║"
echo "║    cd .memory && git add -A && git commit -m 'memory'    ║"
echo "║    && git pull --rebase origin main && git push           ║"
echo "║                                                          ║"
echo "║  其他设备：                                               ║"
echo "║    bash .claude/scripts/memory-init.sh $REMOTE_URL"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
