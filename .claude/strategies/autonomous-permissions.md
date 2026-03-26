# 自治权限策略

> 详细设计见 `docs/claude-triple-system-level8-redesign/permissions.md`

## 当前默认配置

当前使用**全权限 + hook 风险守卫**模式：
- `settings.json`：`Bash(*)`、`Write(*)`、`Edit(*)`、`Read(*)` 等全开放
- 风险控制由运行时 hook 守卫承担，不依赖配置层最小权限
- 产品决策：避免逐条人工授权打断工作流

## 风险守卫机制

| Hook | 类型 | 作用 |
|------|------|------|
| `careful-guard` | PreToolUse | 阻断破坏性命令（rm -rf、DROP TABLE、git push --force） |
| `freeze-guard` | PreToolUse | 阻断锁定范围外的编辑 |
| `pre-tool-escalate` | PreToolUse | 检测高风险操作，自动升档模式 |
| 模式门控 hooks | Standard+/Heavy | 按模式启用验证、质量门、shared-state |

## 三层权限分类（治理参考）

三层模型作为**治理框架**，用于风险分类和高安全场景下的可选收紧。

### Layer 1：低风险（只读、验证）

| 类别 | 具体命令 |
|------|---------|
| 文件系统只读 | `cat`, `ls`, `head`, `tail`, `wc`, `find`, `tree` |
| Git 只读 | `git status`, `git diff`, `git log`, `git branch`, `git stash list`, `git show` |
| 验证类 | `npm test`, `npm run lint`, `npm run typecheck`, `npx tsc --noEmit` |
| 搜索类 | `grep`, `rg`, `ag`, `fd` |
| 信息类 | `node --version`, `npm --version`, `which`, `type`, `env` |

### Layer 2：本地写入（可回滚、无远程副作用）

| 类别 | 具体命令 | 条件 |
|------|---------|------|
| Git 写入 | `git add`, `git commit`, `git checkout -b`, `git stash` | 当前任务需要 |
| 本地构建 | `npm run build`, `npm run dev` | 结果可回滚 |
| 依赖安装 | `npm install`, `pip install` | package.json/requirements.txt 已变更 |
| 本地生成 | 创建/编辑项目文件 | 不涉及远程 |

### Layer 3：高风险（远程写、不可逆）

| 类别 | 具体命令 | 原因 |
|------|---------|------|
| 远程推送 | `git push` | 不可回滚 |
| 部署 | `deploy`, `terraform apply`, `kubectl apply` | 影响生产 |
| 发布 | `npm publish`, `docker push` | 公共可见 |
| 数据迁移 | `migrate`, `prisma migrate deploy` | 数据不可逆 |
| 大规模删除 | `rm -rf`, `DROP TABLE`, `TRUNCATE` | 不可恢复 |
| Secrets | 读取/写入/轮转 secrets | 安全敏感 |

## 可选收紧配置

需要收紧时，可在 `settings.json` 或 `settings.local.json` 中按动作分类配置 allowlist/denylist。参见 `docs/claude-triple-system-level8-redesign/permissions.md` 的"可选：收紧配置"章节。
