# Git Submodule 使用指南

> 把 claude-triple-system-level8 作为 submodule 嵌入你的项目，独立管理、按需更新。

## 概念

Submodule = 在你的项目里嵌入另一个独立的 Git 仓库。

就像手机里装了一个 App：
- 手机（你的项目）和 App（系统库）各自独立更新
- App 更新不会影响手机里的照片（你的代码）
- 你可以选择什么时候更新这个 App

```
my-new-product/          ← 你的项目（主仓库）
├── src/                 ← 你的产品代码
├── package.json
└── .claude-system/      ← submodule，指向 claude-triple-system-level8
    └── .claude/         ← hooks, rules, agents 等
```

你的项目记录的是"我用系统库的**哪个版本**"，而不是把系统库的代码复制进来。两边各自独立管理，互不干扰。

## 快速开始（一键脚本）

```bash
# 在你的项目根目录执行
curl -sL https://raw.githubusercontent.com/ailin546/claude-triple-system-level8/main/.claude/scripts/setup-submodule.sh | bash
```

或者手动操作：

## 完整操作步骤

### 1. 新建项目并添加 submodule

```bash
# 创建新项目
mkdir my-new-product && cd my-new-product
git init

# 把系统库作为 submodule 加进来
git submodule add https://github.com/ailin546/claude-triple-system-level8.git .claude-system

# 创建软链接，让 Claude Code 能识别 .claude 目录
ln -s .claude-system/.claude .claude

# 复制 CLAUDE.md 到项目根目录（可按需修改）
cp .claude-system/CLAUDE.md .

# 提交
git add -A
git commit -m "chore: init project with claude system submodule"
```

### 2. 日常开发（不需要额外操作）

```bash
# 正常写你的代码，submodule 不会被影响
git add src/
git commit -m "feat: add login page"
```

### 3. 更新系统

```bash
# 进入 submodule 目录，拉最新代码
cd .claude-system
git pull origin main
cd ..

# 回到主项目，提交更新
git add .claude-system
git commit -m "chore: upgrade claude system"
```

### 4. 团队成员克隆项目

```bash
# 方式一：克隆时一起拉 submodule（推荐）
git clone --recursive https://github.com/你的用户名/my-new-product.git

# 方式二：先克隆再初始化
git clone https://github.com/你的用户名/my-new-product.git
cd my-new-product
git submodule init
git submodule update
```

> **注意**：克隆后如果软链接失效，重新创建即可：`ln -sf .claude-system/.claude .claude`

### 5. 锁定到特定版本

```bash
cd .claude-system
git checkout v1.0.0  # 或任意 commit hash / tag
cd ..
git add .claude-system
git commit -m "chore: pin claude system to v1.0.0"
```

## 常用命令速查

| 场景 | 命令 |
|------|------|
| 添加 submodule | `git submodule add <url> <path>` |
| 更新到最新 | `cd .claude-system && git pull && cd .. && git add .claude-system` |
| 克隆含 submodule 的项目 | `git clone --recursive <url>` |
| 已克隆后初始化 | `git submodule init && git submodule update` |
| 查看 submodule 状态 | `git submodule status` |
| 锁定特定版本 | `cd .claude-system && git checkout <tag/hash> && cd ..` |
| 移除 submodule | 见下方说明 |

## 移除 submodule

如果不再需要：

```bash
# 1. 取消注册
git submodule deinit -f .claude-system

# 2. 删除 .git/modules 中的缓存
rm -rf .git/modules/.claude-system

# 3. 删除目录和软链接
git rm -f .claude-system
rm -f .claude

# 4. 提交
git commit -m "chore: remove claude system submodule"
```

## 对比：Submodule vs 直接复制

| 维度 | Submodule | 直接复制 |
|------|-----------|----------|
| 更新 | `git pull` 一键更新 | 手动复制覆盖 |
| 版本追踪 | Git 自动记录版本 | 无法追踪 |
| 体积 | 不占主仓库空间 | 重复存储 |
| 团队协作 | 所有人用同一版本 | 各自可能不同 |
| 复杂度 | 需了解 submodule 命令 | 简单直接 |

## 常见问题

### Q: submodule 目录是空的？
克隆后需要初始化：`git submodule init && git submodule update`

### Q: 软链接 .claude 不工作？
重新创建：`ln -sf .claude-system/.claude .claude`

### Q: 想同时修改系统库和项目代码？
可以在 `.claude-system` 里直接修改并推送，然后在主项目 `git add .claude-system` 记录新版本。

### Q: CI/CD 里怎么处理？
在 CI 配置中使用 `git submodule update --init --recursive`，大多数 CI 平台（GitHub Actions, GitLab CI）都有内置支持。
