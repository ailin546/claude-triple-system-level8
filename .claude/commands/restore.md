# /restore — 查看和恢复 Archive 中的组件

从 `*-archive/` 目录中查看可用组件并恢复到活跃目录。

## 步骤

### 1. 列出所有 Archive 内容

运行以下命令，列出各 archive 目录中的可用组件：

```bash
echo "=== Skills Archive ===" && ls .claude/skills-archive/ 2>/dev/null | sed 's/^/  /'
echo "=== Agents Archive ===" && ls .claude/agents-archive/ 2>/dev/null | sed 's/^/  /'
echo "=== Commands Archive ===" && ls .claude/commands-archive/ 2>/dev/null | sed 's/^/  /'
echo "=== Rules Archive ===" && ls .claude/rules-all/ 2>/dev/null | sed 's/^/  /'
```

### 2. 询问用户

向用户展示列表，询问要恢复哪些组件。支持以下格式：
- 按名称：`ecc-django-patterns`
- 按类别：`所有 Django 相关的`
- 按语言：`Python 相关的全部恢复`
- 全部恢复：`全部`

### 3. 执行恢复

根据用户选择，将文件从 archive 移回活跃目录：

- **Skills**: `mv .claude/skills-archive/<name> .claude/skills/`
- **Agents**: `mv .claude/agents-archive/<name>.md .claude/agents/`
- **Commands**: `mv .claude/commands-archive/<name>.md .claude/commands/`
- **Rules**: 语言 rules 由 `rules-loader.js` 自动管理，无需手动恢复。如需手动强制加载某语言：`ln -s ../../rules-all/<lang> .claude/rules/<lang>`

### 4. 确认

恢复完成后，显示当前活跃组件数量统计。
