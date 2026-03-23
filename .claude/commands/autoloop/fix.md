---
name: autoloop:fix
description: 自主错误修复循环。/build-fix 的泛化超集，覆盖 lint/type/test 等所有错误类型。
argument-hint: "[Verify: <cmd>] [--type build|lint|type|test|all] [--iterations N]"
---

# /autoloop:fix — 自主错误修复

> 作为 `/build-fix` 的泛化超集：构建错误委托 build-fix，扩展覆盖 lint/类型/测试错误。

## 与 /build-fix 的关系

| /build-fix | /autoloop:fix |
|-----------|---------------|
| 仅修复构建错误 | 修复所有错误类型 |
| 检测 build system 类型 | 检测所有错误源 |
| 3 次失败后停止 | 3 次失败后切换策略 |
| 手动调用 | 可链式调用 |

## 错误类型检测

```
--type 参数或自动检测：

build → 委托给 /build-fix 的完整流程
lint  → 运行 linter（ESLint/Biome/Ruff 等），逐个修复警告
type  → 运行类型检查器（tsc/mypy 等），逐个修复类型错误
test  → 运行测试，逐个修复失败的测试
all   → 按优先级依次修复：build → type → lint → test
```

## 循环协议

```
Phase 1: DETECT
  - 运行 Verify 命令（或对应错误类型的命令）
  - 解析输出，提取错误列表
  - 按文件路径分组，按依赖顺序排序
  - 记录总错误数

Phase 2: FIX LOOP (One Error at a Time)
  For each error:
    1. Read — 读取错误所在文件（错误行 ± 10 行上下文）
    2. Diagnose — 识别根因
    3. Fix — 最小化修改
    4. Verify — 重新运行命令，确认该错误已修复
    5. Next — 继续下一个错误

  Guardrails（复用 /build-fix 的守卫规则）:
    - 一个 fix 引入超过解决的错误 → 停止并 revert
    - 同一错误 3 次尝试后 → 切换策略或跳过
    - 修复需要架构变更 → 停止并提问

Phase 3: SUMMARY
  - 已修复的错误（附文件路径）
  - 剩余未修复的错误
  - 建议的下一步
```

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `Verify` | 自动检测 | 验证命令 |
| `--type` | `all` | 错误类型过滤 |
| `--iterations` | ∞ | 最大修复轮次 |

## 示例

```
/autoloop:fix Verify: npm run build --type build

/autoloop:fix --type lint Verify: npx eslint . --iterations 50

/autoloop:fix --type all
```
