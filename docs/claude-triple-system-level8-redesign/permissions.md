# 权限治理框架

## 定位

三层权限模型是**治理框架和可选收紧方案**，不是当前默认运行配置。

当前默认实现：**全权限 + hook 风险守卫**。
- `settings.json` 使用 `Bash(*)`、`Write(*)`、`Edit(*)` 等全开放授权。
- 风险控制不依赖配置层最小权限，而是依赖运行时 hook 守卫。
- 这是有意的产品决策：避免逐条人工授权打断工作流。

## 三层权限分类（治理参考）

三层分类用于**风险意识**和**高安全场景下的可选收紧**，不作为默认强制执行标准。

### Layer 1：低风险操作

- 只读文件系统命令
- `git status`、`git diff`、`git log`
- 局部测试、lint、typecheck
- 只读搜索与静态分析

### Layer 2：本地写入操作

- `git add`、`git commit`、创建分支
- 本地构建、依赖安装
- 本地文件创建和编辑

### Layer 3：高风险操作

- `git push`、`deploy`、`publish`
- 数据迁移执行、远程写操作
- 大规模删除、secrets 操作

## 当前风险控制方式

默认不通过配置层限制权限，而是通过以下机制提供风险守卫：

| 机制 | 覆盖范围 | 行为 |
|------|---------|------|
| `careful-guard` (PreToolUse) | 破坏性 Bash 命令 | 阻断并提示 |
| `freeze-guard` (PreToolUse) | 编辑范围锁 | 阻断锁定范围外编辑 |
| `pre-tool-escalate` (PreToolUse) | 高风险命令/路径 | 自动升档模式 |
| 模式门控 (mode-check) | Standard+/Heavy hooks | 按模式启用验证链 |

## 可选：收紧配置

若用于更高安全要求环境（生产部署、团队共享仓库等），可在 `settings.json` 或 `settings.local.json` 中按动作分类收紧：

```jsonc
{
  "permissions": {
    "allow": [
      "Read(*)", "Glob(*)", "Grep(*)", "WebSearch(*)", "WebFetch(*)",
      "TodoWrite(*)", "Agent(*)",
      "Bash(npm test *)", "Bash(npm run lint *)",
      "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)"
    ],
    "deny": [
      "Bash(git push *)", "Bash(npm publish *)"
    ]
  }
}
```

**收紧时的建议**：
1. 按动作分类，不按解释器分类（避免 `Bash(node *)` 等大前缀）。
2. Layer 1 操作长期允许。
3. Layer 2 按任务需要开放。
4. Layer 3 保留人工确认。

## 权限与模式的关系

三档模式控制的是**流程强度**（哪些 hooks 运行、是否建议 TDD/review），不直接控制权限配置。权限配置是独立的、可选的收紧维度。
