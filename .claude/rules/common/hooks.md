# Hooks

> 2026-10-07 harness 收缩后只剩 7 个 hook：全是守卫型或零上下文成本的自动化。提醒型 hook、Fast/Standard/Heavy 模式机器、自建记忆管道、Board 模式已删（计划：`quant-deploy/reports/harness-slim-plan-2026-10-07.md`）。新增 hook 只允许「必须每次发生、不需要 Claude 思考」的事，优先阻断型；14 天内同类事故 ≥ 2 次才考虑重建。

| Hook | 事件 | 作用 | 测试 |
|---|---|---|---|
| rules-loader | SessionStart | 按项目语言把 `rules-all/<lang>/` 软链进 `rules/<lang>/`；`rules/common/` 始终加载 | — |
| careful-guard | PreToolUse(Bash) | 破坏性命令守卫：DENY（fork bomb / 格式化文件系统 / 裸设备写 / 删根目录）无条件拦；CONTEXTUAL 按上下文判（clean tree 的 reset、仅 build 工件的递归删除放行）；单条 git/cargo/npm 走 allowlist。状态 `~/.claude/.careful-enabled`，`/careful` 开关。按命令字面扫描，heredoc 文本里出现关键词也会拦 | `careful-guard.test.js`(50) + `command-scan.test.js` |
| fix-depth-check | PreToolUse(Bash) | `git commit` 含 fix 关键字但缺根因解释（root cause / because / 原因 / 根因）→ 软警告 | `fix-depth-check.test.js` |
| freeze-guard | PreToolUse(Edit\|Write) | `/freeze` 编辑范围锁 | — |
| post-edit-light | PostToolUse(Edit\|Write) | console.log 警告 + 风险关键词扫描 | — |
| ssot-source-guard | PostToolUse(Edit\|Write) | 新增已知 SSOT-risk 读取模式时经 additionalContext 软提醒（Rule 0 的 hook 侧），每会话每文件每模式一次 | `ssot-source-guard.test.js`(23) |
| post-edit-format | PostToolUse(Edit\|Write, async) | Biome / Prettier / rustfmt 自动格式化。会顺着 `mod` 重排整个 crate 文件，改 `.rs` 前先 `rustfmt --check` | — |

## 输出渠道（2026-06-29 实测，`lib/hook-output.js`）

PreToolUse / PostToolUse 的 exit-0 stdout 与 stderr 模型都看不到。要让模型看到用 `emitAdditionalContext`（stdout 只能有这一个 JSON envelope，不能再写别的字节）；要阻断用 exit 2。SessionStart / UserPromptSubmit 的 stdout 直接进上下文。

## 项目根与会话身份（唯一解析点）

- `lib/project-root.js::getProjectRoot()`：`CLAUDE_PROJECT_DIR` → 两个守卫（落在 `~/.claude/` 折返 HOME；落在 `.memory/` 内上溯）→ git checkout 根。`getProjectMemoryDir()` = 主 checkout 根下的 `.memory/`。测试 `project-root.test.js`。
- `lib/utils.js::hookSessionId`：hook 输入 `session_id` → `CLAUDE_CODE_SESSION_ID`；都没有就不记录。测试 `session-identity.test.js`。

## 改 hook / 规则 / settings 后

跑完成门（细则 `on-demand/self-evolution.md`）：`scripts/utils/manifest-generate.js --drift-only`、`namespace-check.js`、`rules-load-snapshot.js`、`~/.claude-system/scripts/sync_workflow.py --check`；然后 `quant-deploy/scripts/push-all.sh`。
