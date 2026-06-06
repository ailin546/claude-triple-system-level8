# Hook Test 标杆

> 2026-05-20 M4：补 G3 缺口（hook 测试零基线）。建立测试规范，**不**引入 jest/mocha 等框架。

## 必测边界（按副作用风险分层）

新增 hook 触发以下**任一**类别即**必须**配单测（详见 `agents.md §新增机制注册清单`）：

| 类别 | 风险 | 示例 hook |
|---|---|---|
| **state file** | 写文件后状态污染影响未来 session | `evaluation-gate`, `stop-summary` (architecture-rescue) |
| **mode gate** | 错误条件下 hook 行为不一致 | `shared-state-sync`, `quality-gate` |
| **阻断** (exit 1/2) | 阻断用户合法操作 | `careful-guard`, `evaluation-gate`, `freeze-guard` |
| **改 context** (stderr 注入) | Claude 看到错信号 | `fix-depth-check`, `user-prompt-classify` |
| **解析配置/内容** | regex/parser bug 漏过或误抓 | `fix-depth-check` (commit msg), `careful-guard` (command parse) |

**单纯纯函数 utility（无 stdin/stderr 副作用）可豁免**，但应在文件顶部注释说明"无副作用"。

## 标杆文件

| 文件 | 覆盖类别 | 测试数 |
|---|---|---|
| [careful-guard.test.js](./careful-guard.test.js) | 阻断 + 解析配置 + 改 context | 41 |
| [evaluation-gate.test.js](./evaluation-gate.test.js) | state file + mode gate + 阻断 + hermetic subprocess 集成 | 29 |
| [fix-depth-check.test.js](./fix-depth-check.test.js) | 解析配置 + 改 context | 31 |
| [pre-tool-escalate.test.js](./pre-tool-escalate.test.js) | 解析配置（命令分段匹配）+ mode 升档 | 22 |
| [command-scan.test.js](./command-scan.test.js) | 纯函数解析库（strip-quote / segment / git-head）| 20 |

> 2026-06-06：`command-scan.js` 是 `lib/` 下的纯函数解析库（无副作用，README §17 本可豁免），但因它支撑两个阻断 hook（evaluation-gate exit 2 + pre-tool-escalate mode），仍配单测。`evaluation-gate.test.js` 新增 subprocess 集成测试演示如何用 throwaway `HOME` hermetic 跑真实 hook 的 exit-code，不碰真实 marker。

## 零依赖测试模式

**不引入框架**（Codex 一贯反对加测试基础设施）。沿用 Node 内置 `assert`：

```js
#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const { fn1, fn2 } = require(path.join(__dirname, '..', '<hook>.js'));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (err) { fail++; process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`); }
}

t('describes what it tests', () => assert(fn1(input) === expected));
// ... more tests

process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
```

## Hook export 模式

让 hook 内部函数/常量可单独测试。模板：

```js
// === hook 逻辑 ===
function helper() { ... }
function main() { ... }

// === export + main-guard ===
module.exports = { helper, /* other functions/constants */ };

if (require.main === module) {
  try { main(); } catch { process.exit(0); }
}
```

**关键**：`require.main === module` 保证 test require 时不触发 main()。

## 运行所有测试

```bash
for f in ~/.claude/scripts/hooks/__tests__/*.test.js; do
  echo "=== $(basename $f) ==="
  node "$f" || echo "FAIL: $f"
done
```

或单独：

```bash
node ~/.claude/scripts/hooks/__tests__/careful-guard.test.js
node ~/.claude/scripts/hooks/__tests__/evaluation-gate.test.js
node ~/.claude/scripts/hooks/__tests__/fix-depth-check.test.js
```

## 测试覆盖度参考

| Hook 类型 | 最小 test 数 | 目标 case |
|---|---|---|
| state file | 5-10 | setup/cleanup, valid/invalid marker, stale/fresh, missing field |
| mode gate | 3-5 | fast skip, standard pass, heavy pass, mode file 缺失 |
| 阻断 | 8-15 | 每类阻断条件 + 边界 + bypass |
| 改 context | 5-10 | 触发条件正例 / 反例 / 边界 |
| 解析 | 10-30 | regex 每个 alternation / edge case / 占位符 |

## 不必测的部分

- 纯文档调整、注释、log 措辞
- `process.exit(0)` 透传分支（属于框架行为）
- 第三方 module 包装（仅在 wrapper 逻辑独特时测）

## 当 test 失败时

按 `~/.claude/CLAUDE.md §编码行为准则 Rule 1`：
- 不要简单调整 test 让它通过（绕症状）
- 先问 "为什么失败" → 修 hook 或修 test 都是消除根因，但要分清是哪个
- 测试失败也是 fix-intent task，按 3-step protocol 处理
