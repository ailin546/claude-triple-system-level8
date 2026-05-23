---
name: specify
description: "Use before /plan in Standard+ mode to lock down task constitution — inviolable principles, scope boundaries, and acceptance criteria. Defines what 'done' means before planning starts."
---

# Specify — 任务宪法

在 /plan 之前执行。用 2-3 轮对话与用户对齐范围和标准，然后锁定为文件。

**宣告**："我正在使用 specify skill 定义任务宪法。"

## 为什么需要这一步

/plan 解决"怎么做"，但如果"做什么"和"怎样算完成"没对齐，计划再好也会偏。
典型事故：纸盘/实盘分离做了 3 轮修补，因为第一次没锁定"所有页面一致""成交也分""统计也分"。

## 输出格式（简短，用户 5 秒能看完）

```markdown
## 任务宪法：{任务名}

### 范围
- 包含：{具体模块/页面/API}
- 不包含：{明确排除的}

### 不可违反原则
1. {原则 1}
2. {原则 2}
3. {原则 3}

### 验收条件（MUST）
- [ ] {具体的、可验证的条件 1}
- [ ] {具体的、可验证的条件 2}
- [ ] {具体的、可验证的条件 3}

### 验收条件（SHOULD）
- [ ] {期望但非强制的条件}
```

## 执行流程

### Round 1：Claude 输出初稿
- 基于用户请求，输出任务宪法初稿
- 主动列出多种理解（"这个需求有几种理解：A/B/C，你倾向哪种？"）
- 不超过 15 行

### Round 2-3：用户修正
- 用户说"范围不对"→ 调整
- 用户说"加一条原则"→ 加
- 用户说"验收条件太松"→ 收紧
- 用户说"确认"→ 锁定

### 锁定
- 确认后写入 `.claude/specify.md`（覆盖上一次）
- 后续 /plan 和 /verify 引用此文件
- 实施过程中发现需要改 specify → 必须回来重新确认，不可静默修改

## 与其他命令的关系

```
/specify → 锁定范围和标准（WHAT + DONE）
    ↓
/plan → 基于 specify 制定计划（HOW），强制输出 AC 段
    ↓
实施 → 按 plan 执行
    ↓
/verify → 对照 specify 的验收条件逐条检查（ALL 模式都检查）
```

## 什么时候用

- Standard+ 模式的功能开发（/plan 之前）
- 用户需求可能有多种理解时
- 跨多个模块/页面的改动
- 之前同类任务出过遗漏时

## 什么时候不用

- Fast 模式的小修复
- 单文件改动
- 需求完全无歧义（如"修复这个 typo"）

## CONTEXT.md 域词汇表（锁定后顺手维护）

specify 完成、用户确认后，自检一次：**此次澄清是否引入新的项目术语或修正了既有术语？**

是 → 同步追加/修正到 `PROJECT/CONTEXT.md`（不存在则创建）。

CONTEXT.md 只是**领域词汇表**：
- ✅ 记：术语 → 一句话定义；术语 → 同义词/反义词；术语 → 涵盖与不涵盖
- ❌ 不记：实现细节、spec、计划、API schema、临时决策
- 格式：每条 1-3 行，按字母/拼音排序，方便 Claude grep

示例：
```markdown
## 物化级联 (Materialization Cascade)
section 内 lesson 被标记 real 时，自动给文件系统位置的连锁过程。
- 覆盖：lesson 文件创建、section 目录补全、index 重建
- 不覆盖：lesson 内容生成（那是 lesson-generator 的事）
```

理由：长期项目里术语漂移成本极高（Claude 每次会话重新发明同义词）。本机制是 grill-with-docs (mattpocock/skills) 的本地化吸收。

## ADR 触发判定（严格门槛）

specify 过程中如果出现**真实架构权衡**，判定是否落 ADR (`docs/adr/NNNN-*.md`)：

**三条件必须全满足**：
1. **难逆** — 改回去成本 ≥ 1 天工作
2. **无上下文会困惑** — 半年后看代码的人会问"为什么这么做？"
3. **真实权衡** — 存在过 ≥2 个合理替代方案，选当前方案有具体理由

任一不满足 → 不写 ADR（不要为了"留痕"而 ADR）。

ADR 格式（最小）：
```markdown
# NNNN — 标题

## Status
Accepted | Superseded by NNNN

## Context
触发决策的约束/问题。

## Decision
选了什么。

## Alternatives Considered
- 方案 B：为什么不选
- 方案 C：为什么不选

## Consequences
正面/负面后果。
```

## 反模式

- ❌ 写成技术方案（那是 /plan 的事）
- ❌ 超过 20 行（太长用户不看）
- ❌ 用模糊词（"体验好""性能可接受"→ 改为具体指标）
- ❌ 未确认就开始 /plan
