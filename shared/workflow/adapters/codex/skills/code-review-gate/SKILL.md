---
name: "code-review-gate"
description: "用于非平凡改动完成后或合并前：按严重级别、架构风险、安全性、可维护性和验证证据审查变更，并给出明确交付建议。"
---

# Code Review Gate

这个技能用于把“看起来能跑”升级成“可以交付/合并”的审查门。

## 适用场景

- 中大型改动完成后
- 合并前自查
- 涉及安全、权限、数据、部署、并发、性能的改动
- 用户明确要求 review / code review / 审查

## 输入优先级

1. 用户指定的文件或 diff
2. 当前 `git diff`
3. 最近一次任务涉及的关键文件

## 审查维度

- `Correctness`：行为是否满足需求，边界条件是否遗漏
- `Security`：注入、权限、凭据、路径、XSS/CSRF、敏感信息
- `Architecture`：接口边界、耦合、长期维护风险
- `Performance`：复杂度、N+1、缓存、热点路径
- `Maintainability`：重复、命名、错误处理、测试可写性
- `Verification`：现有验证是否证明了关键声明

## 严重级别

- `Critical`：安全漏洞、数据破坏、生产阻断，必须修
- `High`：明确 bug 或高概率回归，合并前应修
- `Medium`：可维护性/边界问题，建议本轮修
- `Low`：风格、命名、小优化，可后续处理

## 架构状态

- `CLEAR`：没有发现阻塞性设计问题
- `WATCH`：存在非阻塞但应记录的设计风险
- `BLOCK`：存在不解决就不应交付的设计问题

## 输出格式

```markdown
## Review Result

- Verdict: APPROVE / COMMENT / REQUEST CHANGES
- Architectural Status: CLEAR / WATCH / BLOCK
- Files Reviewed:
- Verification Evidence:

### Findings

#### Critical
- none

#### High
- `path:line` — issue / risk / fix

#### Medium
- ...

#### Low
- ...

### Notes
- Verified:
- Not Verified:
```

## 判定规则

- 有 `Critical` 或 `High`：`REQUEST CHANGES`
- 架构状态为 `BLOCK`：`REQUEST CHANGES`
- 只有 `Medium/Low` 或架构状态 `WATCH`：`COMMENT`
- 无实质问题且验证证据足够：`APPROVE`

## 纪律

- 只报告有证据的问题，不用泛泛建议充数。
- 每条 finding 尽量包含文件行号、风险和具体修复方向。
- 区分“已验证”和“推断”。
- 不把审查变成大范围重构任务，除非用户要求继续修。
