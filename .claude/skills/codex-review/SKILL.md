---
description: Cross-AI code review using the official codex-plugin-cc Claude Code plugin (no direct codex CLI calls)
triggers:
  - before merging critical PRs
  - after code review for second opinion
  - on demand for adversarial analysis
---

# Codex Cross-AI Review (via codex-plugin-cc)

Use OpenAI 官方 Claude Code 插件 [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) 作为独立"第二双眼"，消除 Claude 自审盲区。

> **本 skill 不再调用 `codex` CLI**。所有交互通过插件提供的 `/codex:*` 斜杠命令完成；这样可复用插件的会话管理、后台任务、认证与 token 计费逻辑。

## Prerequisites

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

`/codex:setup` 会自动检测/安装 Codex CLI 并完成登录（OAuth Free 档或 API key）。Node.js ≥ 18.18。

## Three Modes

### 1. Standard Review

针对 base 分支的标准只读审查：

```text
/codex:review
```

**Gate verdict：**
- 输出含 `[P1]` → **FAIL**（关键发现，必须修复）
- 仅 `[P2]` 或无发现 → **PASS**

### 2. Adversarial Challenge

压力测试代码的生产失败模式：

```text
/codex:adversarial-review
```

让 Codex 像攻击者和混沌工程师一样寻找 race conditions、security holes、resource leaks、silent data corruption。把 critical 标 `[P1]`，informational 标 `[P2]`。

如需要更细粒度的 prompt，可在调用时附加自然语言指令，例如：

```text
/codex:adversarial-review focus on auth + payment paths in the diff
```

### 3. Consult / Rescue Mode

委派调查或修复任务：

```text
/codex:rescue <question or task>
```

后台任务管理：

```text
/codex:status     # 查看进行中的任务
/codex:result     # 查看完成任务输出
/codex:cancel     # 取消任务
```

会话连续性由插件自身处理，**不需要**再手工保存 session id。

## Output Format

```
## Codex Review Results

Mode: review | adversarial-review | rescue
Gate: PASS | FAIL (N critical findings)

### Findings
[P1] SQL injection in user input handler (src/routes/users.ts:42)
[P2] Missing error boundary in React component (src/App.tsx:15)
```

## Integration

- **After `/code-review`**：可选第二意见
- **Before `/ship`**：关键发布走 `/codex:adversarial-review` 作为终极 gate
- **结果记录**：插件输出可被 `/learn` 提取模式

## Important Notes

- 插件 sandbox 默认只读；修改类任务通过 `/codex:rescue` 显式委派
- Free 档有速率限制；只在关键审查时使用
- 如插件未安装，`skill` 输出安装指引并优雅跳过；**禁止 fallback 到直接 `codex` CLI 调用**
- 若旧脚本/agent 仍在 spawn `codex` 子进程，应改写为提示用户运行对应 `/codex:*` 命令
