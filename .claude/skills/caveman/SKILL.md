---
name: caveman
description: "Use when user invokes /caveman or says 'caveman mode' / 'less tokens' / 'be brief' — compresses output ~75% by dropping articles/filler/pleasantries while keeping technical accuracy. Auto-disabled in structured-output contexts (evaluation-loop / code-review / verify / safety warnings)."
---

# Caveman — 输出压缩模式

显式启用的低噪音输出模式。**默认关闭**，用户主动触发才生效。

**宣告**："caveman mode on" — 之后所有回复进入压缩态，直到用户说 "stop caveman" / "normal mode"。

## 规则

丢：
- 冠词 (a/an/the)
- 填充词 (just / really / basically / actually / simply)
- 客套 (sure / certainly / of course / happy to / let me)
- 对冲 (might / perhaps / I think / it seems)
- 不必要连词 (and so / and then / as well as)

保留：
- 代码块原样
- 错误信息原样引用
- 技术术语精确
- 文件路径 / 行号 / 命令完整

风格：
- 片段 OK，主谓宾省略 OK
- 短同义词 (big > extensive, fix > implement fix for)
- 缩写 (DB / auth / config / req / res / fn / impl)
- 因果用箭头 X → Y
- 一词够 → 一词

模式：`[thing] [action] [reason]. [next step].`

### 例

❌ "Sure! The issue is likely caused by the auth middleware using `<` instead of `<=` when checking token expiry."

✅ "Auth middleware bug. Token check `<` should be `<=`. Fix:"

## 强制豁免（自动恢复完整输出）

以下场景**自动**跳出 caveman，输出结束后再恢复：

| 场景 | 理由 |
|---|---|
| evaluation-loop / Evaluator 输出 | gate marker 需要可审计的 verdict + evidence |
| /code-review / requesting-code-review 输出 | 审查反馈需要 reviewer 能复现的具体上下文 |
| /verify 报告 | 验证证据需要原样保留命令输出 |
| 安全警告 (密钥泄露 / SQL 注入 / XSS) | 误读成本极高 |
| 不可逆操作确认 (rm -rf / drop / force push) | 必须完整描述影响 |
| 多步骤顺序操作 | 片段化顺序会被误读 |
| /specify / /plan 输出 | 任务宪法和 AC 需要可对照 |
| ADR / PRD / issue 内容 | 长期文档需要可读性 |
| 用户说"clarify" / "再说一遍" / "看不懂" | 信号是上一轮压缩过头 |

豁免期间正常输出，豁免结束后**自动**回到 caveman，不需要用户重新触发。

## 何时禁用

- Heavy 模式下涉及 evaluation-gate marker 提交 — **整段会话禁用**
- 用户首次接触某话题（背景上下文比 token 重要）
- 教学性解释 / debugging session 解释根因

## 与 ecc-strategic-compact 的区别

- `ecc-strategic-compact` — 在 context 接近上限时建议 manual /compact（处理输入侧）
- `caveman` — 压缩 Claude 输出侧 token（处理输出侧）

两者正交，可同时启用。
