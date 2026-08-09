---
name: "workflow-doctor"
description: "用于诊断本机 Codex 全局工作流安装：检查 AGENTS.md、skills、hooks.json、config.toml、hook 脚本、项目模板以及遗留/重复配置。"
---

# Workflow Doctor

这个技能用于检查本机 `codex-global-workflow` 是否正确安装、是否存在重复或过期配置。

## 检查范围

全局层：

- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`
- `~/.codex/hooks.json`
- `~/.codex/scripts/codex-global-hook.py`
- `~/.codex/skills/`
- `~/.memory/`（Claude 与 Codex 的共享全局记忆）
- `~/.codex/memories/`（只读迁移来源，不应继续写入）

项目层（按需存在，不要求每个项目都创建 overlay）：

- `PROJECT/AGENTS.md`（项目有专属规则时）
- `PROJECT/.memory/`（项目使用共享记忆时）
- `PROJECT/.memory/handoff.md`（存在未完成交接时）
- `PROJECT/.codex/project-context.md`（可选的 Codex 专属补充上下文）

`PROJECT/.codex/project-context.md` 不是框架运行必需项；项目已有 `AGENTS.md`、文档
和共享记忆时通常不需要它。缺少该文件不应产生 WARN。`PROJECT/.memory/handoff.md`
也是按需文件，没有跨会话交接时缺少它是正常状态。

遗留/冲突层：

- `~/.agents/skills/`
- `~/.codex/agents/`
- `~/.codex/commands/`
- 旧 hook 脚本或重复 hook 注册
- Hook 或 Skill 仍把 `~/.codex/memories/` 当成活跃写入目标
- Hook、Skill 或诊断规则仍要求旧的 `PROJECT/.codex/handoff.md`

## 建议命令

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
ls -la "$CODEX_HOME/AGENTS.md" "$CODEX_HOME/config.toml" "$CODEX_HOME/hooks.json"
find "$CODEX_HOME/skills" -maxdepth 2 -name SKILL.md | sort
python3 -m json.tool "$CODEX_HOME/hooks.json" >/dev/null
python3 "$CODEX_HOME/scripts/codex-global-hook.py" <<<'{"hook_event_name":"SessionStart","cwd":"'$PWD'"}'
```

## 必查配置

`config.toml` 应包含或保留：

- `developer_instructions`
- `[features].multi_agent = true`
- `[features].child_agents_md = true`
- `[features].codex_hooks = true`
- `[agents].max_threads`
- `[agents].max_depth`

`hooks.json` 应注册：

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`

## Project Overlay 判定

- 项目完全依赖全局 AGENTS 且没有 `.codex/project-context.md`：`OK`，不是缺失配置。
- 没有当前交接而缺少 `.memory/handoff.md`：`OK`。
- 存在 `.memory/handoff.md`：检查其可读性和是否仍与当前目标相关。
- 存在 `.codex/project-context.md`：检查是否确有项目专属内容、是否与 AGENTS 冲突；
  不因为它存在就自动判定健康。
- 不检查旧 `.codex/handoff.md` 是否存在；只有仍有活跃 Hook/Skill 引用或写入该旧
  路径时才报告漂移。

## 输出格式

```markdown
## Workflow Doctor Report

- Status: HEALTHY / WARN / BROKEN
- Active CODEX_HOME:
- Global Framework Path:

| Check | Status | Details |
| --- | --- | --- |
| AGENTS.md | OK/WARN/BROKEN | ... |
| Skills | OK/WARN/BROKEN | ... |
| Hooks JSON | OK/WARN/BROKEN | ... |
| Hook Script | OK/WARN/BROKEN | ... |
| Config TOML | OK/WARN/BROKEN | ... |
| Project Overlay | OK/WARN/BROKEN | ... |
| Legacy Roots | OK/WARN/BROKEN | ... |

### Recommended Fixes
- ...
```

## 修复原则

- 先备份再改配置。
- 只移除本框架管理的 hook 条目，不破坏用户自定义 hook。
- 不自动删除遗留目录，除非用户明确同意。
- 可选 overlay 缺失不报警；只对真实冲突、过期引用、不可解析配置和重复注册报警。
- 诊断安装形态不等于证明模型调用可用；认证/API 可用性需要单独验证。
