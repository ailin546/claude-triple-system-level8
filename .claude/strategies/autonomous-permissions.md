# 自治权限策略

> 详细设计见 `docs/claude-triple-system-level8-redesign/permissions.md`

## 三层权限模型

### Layer 1：默认允许（只读、低风险）

| 类别 | 具体命令 |
|------|---------|
| 文件系统只读 | `cat`, `ls`, `head`, `tail`, `wc`, `find`, `tree` |
| Git 只读 | `git status`, `git diff`, `git log`, `git branch`, `git stash list`, `git show` |
| 验证类 | `npm test`, `npm run lint`, `npm run typecheck`, `npx tsc --noEmit` |
| 搜索类 | `grep`, `rg`, `ag`, `fd` |
| 信息类 | `node --version`, `npm --version`, `which`, `type`, `env` |

**要求**：不写远程、不破坏文件、不改变部署或数据状态。

### Layer 2：条件允许（可回滚、无远程副作用）

| 类别 | 具体命令 | 条件 |
|------|---------|------|
| Git 写入 | `git add`, `git commit`, `git checkout -b`, `git stash` | 当前任务需要 |
| 本地构建 | `npm run build`, `npm run dev` | 结果可回滚 |
| 依赖安装 | `npm install`, `pip install` | package.json/requirements.txt 已变更 |
| 本地生成 | 创建/编辑项目文件 | 不涉及远程 |

**条件**：任务明确需要、结果可回滚、不涉及远程副作用。

### Layer 3：必须人工确认（永不默认自治）

| 类别 | 具体命令 | 原因 |
|------|---------|------|
| 远程推送 | `git push` | 不可回滚 |
| 部署 | `deploy`, `terraform apply`, `kubectl apply` | 影响生产 |
| 发布 | `npm publish`, `docker push` | 公共可见 |
| 数据迁移 | `migrate`, `prisma migrate deploy` | 数据不可逆 |
| 大规模删除 | `rm -rf`, `DROP TABLE`, `TRUNCATE` | 不可恢复 |
| Secrets | 读取/写入/轮转 secrets | 安全敏感 |

## 禁止的大前缀白名单

以下宽泛授权方式**禁止使用**：

```
❌ Bash(node *)
❌ Bash(npx *)
❌ Bash(git *)
❌ Bash(python *)
❌ Bash(sh *)
```

**原因**：范围过大、难以审计、容易把局部问题升级为系统性风险。

## 权限与模式联动

| 模式 | 允许层级 | 说明 |
|------|---------|------|
| **Fast** | 仅 Layer 1 | 只读操作，不写文件以外的东西 |
| **Standard** | Layer 1 + 需要时 Layer 2 | 可 commit、可本地构建 |
| **Heavy** | Layer 1 + Layer 2 | Layer 3 永远需要人工确认 |

## 推荐配置

按动作分类批准，不按解释器分类：

```jsonc
// settings.json 或 settings.local.json
{
  "permissions": {
    "allow": [
      // Layer 1: 只读
      "Read(*)", "Glob(*)", "Grep(*)", "WebSearch(*)", "WebFetch(*)",
      "TodoWrite(*)", "Agent(*)",
      // Layer 1: 验证
      "Bash(npm test *)", "Bash(npm run lint *)", "Bash(npm run typecheck *)",
      "Bash(npx tsc *)",
      // Layer 1: Git 只读
      "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)",
      "Bash(git branch *)", "Bash(git show *)"
    ]
  }
}
```

> 当前 settings.json 已按此模式配置。Layer 3 操作（git push、deploy、publish、rm -rf）
> 在 `deny` 列表中被显式阻止。
