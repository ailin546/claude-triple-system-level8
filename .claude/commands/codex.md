---
description: Cross-AI code review via OpenAI's official codex-plugin-cc Claude Code plugin.
mode: Standard / Heavy
when: 关键 PR 合并前、Claude 自审后想要独立第二意见、对抗性审查
not_when: 纯文档改动、配置微调、Fast 模式小修复
---

# /codex — codex-plugin-cc 入口

本系统不再直接调用 `codex` CLI。所有 Codex 交互统一通过官方插件 [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) 提供的 `/codex:*` 斜杠命令完成。

## 一次性安装

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

`/codex:setup` 会引导完成 Codex CLI 安装与登录（如缺失会提示 `npm install -g @openai/codex` 与 `codex login`）。

> 新 session 启动时 `codex-plugin-check` SessionStart hook 会自动检测：未安装则在上下文中显示上述 4 行命令；已安装则保持沉默。`codex login`（OAuth）必须在浏览器人工完成，无法跳过。

## 推荐用法

| 旧用法 | 新用法（插件） | 用途 |
|--------|---------------|------|
| `/codex review` | `/codex:review` | 标准只读代码审查 |
| `/codex challenge` | `/codex:adversarial-review` | 对抗性挑战式审查 |
| `/codex consult <q>` | `/codex:rescue` | 委派任务给 Codex 调查/修复 |
| — | `/codex:status` / `/codex:result` / `/codex:cancel` | 后台任务管理 |

详细流程见 skill：`.claude/skills/codex-review/SKILL.md`。

## Gate 机制（沿用）

- 输出含 `[P1]` → **FAIL**（必须修复）
- 仅 `[P2]` 或无发现 → **PASS**

## 前置条件

- Node.js ≥ 18.18
- ChatGPT 订阅（含 Free 档）或 OpenAI API key
- 首次使用前先运行 `/codex:setup`

## 注意

- 旧 `/codex` 命令保留为本说明文件，**不再执行任何 `codex` CLI 调用**。
- 项目内任何位置（skills/agents/scripts）都应改用 `/codex:*` 斜杠命令；不要再 spawn `codex` 子进程。
