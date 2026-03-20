#!/usr/bin/env bash
# setup-submodule.sh — 在当前项目中以 submodule 方式集成 claude-triple-system-level8
#
# 用法：
#   cd your-project
#   bash /path/to/setup-submodule.sh
#   # 或
#   curl -sL https://raw.githubusercontent.com/ailin546/claude-triple-system-level8/main/.claude/scripts/setup-submodule.sh | bash

set -euo pipefail

REPO_URL="https://github.com/ailin546/claude-triple-system-level8.git"
SUBMODULE_PATH=".claude-system"
SYMLINK_PATH=".claude"

# 颜色输出
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# 检查是否在 git 仓库内
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    red "错误：当前目录不是 Git 仓库。请先运行 git init"
    exit 1
fi

# 检查是否已存在 submodule
if [ -d "$SUBMODULE_PATH" ]; then
    yellow "检测到 $SUBMODULE_PATH 已存在"
    read -rp "是否更新到最新版本？(y/N) " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        green "更新 submodule..."
        cd "$SUBMODULE_PATH"
        git pull origin main
        cd ..
        git add "$SUBMODULE_PATH"
        green "已更新到最新版本。运行 git commit 提交更改。"
    fi
    exit 0
fi

# 检查是否已存在 .claude 目录（非软链接）
if [ -d "$SYMLINK_PATH" ] && [ ! -L "$SYMLINK_PATH" ]; then
    yellow "检测到已有 .claude/ 目录（非软链接）"
    yellow "建议先备份现有配置："
    yellow "  mv .claude .claude-backup"
    red "中止操作。请处理现有 .claude 目录后重试。"
    exit 1
fi

green "=== 开始设置 claude-triple-system-level8 submodule ==="

# 添加 submodule
green "1/4 添加 submodule..."
git submodule add "$REPO_URL" "$SUBMODULE_PATH"

# 创建软链接
green "2/4 创建软链接 .claude -> .claude-system/.claude ..."
rm -f "$SYMLINK_PATH"  # 移除可能存在的旧链接
ln -s "$SUBMODULE_PATH/.claude" "$SYMLINK_PATH"

# 复制 CLAUDE.md
green "3/4 复制 CLAUDE.md..."
if [ -f "CLAUDE.md" ]; then
    yellow "  CLAUDE.md 已存在，跳过（可手动从 .claude-system/CLAUDE.md 合并）"
else
    cp "$SUBMODULE_PATH/CLAUDE.md" .
fi

# 运行 install 脚本（如果存在）
green "4/4 运行安装脚本..."
if [ -f "$SUBMODULE_PATH/.claude/scripts/install-level8.sh" ]; then
    bash "$SUBMODULE_PATH/.claude/scripts/install-level8.sh"
fi

green ""
green "=== 设置完成！==="
green ""
green "下一步："
green "  git add -A"
green "  git commit -m 'chore: add claude system submodule'"
green ""
green "团队成员克隆时需要使用："
green "  git clone --recursive <your-repo-url>"
green ""
green "更新系统："
green "  cd .claude-system && git pull origin main && cd .."
green "  git add .claude-system && git commit -m 'chore: upgrade claude system'"
