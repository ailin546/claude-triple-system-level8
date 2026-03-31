---
name: evaluation-loop
description: GAN 式 Generator-Evaluator 反馈循环——编排现有验证工具，将生成与评估分离，防止自我表扬
triggers:
  - 功能实现完成后、/verify 之前
  - 用户显式调用
mode: Standard / Heavy
max_rounds: 3
---

# Evaluation Loop

> 灵感来源：[Anthropic Harness Design](https://www.anthropic.com/engineering/harness-design-long-running-apps)
> 核心原则：**生成者不评估自己的工作，评估者不发明标准**

## 为什么需要这个 Skill

单 Agent 自我评估存在"病态乐观"问题——即使质量平庸也会自信地给出高分。
将生成（Generator）和评估（Evaluator）分离为不同角色，可以显著提高输出质量。

## 架构归属

```
Layer 2 (Superpowers): 本 Skill — 定义流程（怎么做）
Layer 3 (Agency Agents): Reality Checker — 定义角色（谁来评）
Layer 1 (ECC): /verify — 客观检查（硬性门槛）
```

## 流程

```
Generator 完成功能
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 1: 硬验证（客观，必须全过）          │
│  → 运行 /verify quick                   │
│  → 检查：build + types + lint + tests   │
│  → 不通过 → 直接返回错误，要求修复       │
└────────────────┬────────────────────────┘
                 │ 通过
                 ▼
┌─────────────────────────────────────────┐
│ Step 2: E2E 验证（有前端时触发）          │
│  → 调用 e2e-runner Agent                 │
│  → 使用 Playwright MCP 交互实际应用       │
│  → 截图存到项目临时目录或 artifacts/       │
│  → 无前端变更 → 跳过                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Step 3: 设计验证（有 UI 变更时触发）      │
│  → 调用 design-review skill             │
│  → WCAG AA + 响应式 + 设计规范           │
│  → 无 UI 变更 → 跳过                    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Step 4: 现实性检查（独立 Agent）          │
│  → 调用 Reality Checker Agent            │
│  → 输入：Step 1-3 的结果 + /plan 验收标准│
│  → 逐条对照 acceptance criteria          │
│  → 默认态度：NEEDS WORK                  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Step 5: 判定                             │
│  ├ 硬验证通过 + Reality Checker 通过     │
│  │  → ✅ 接受，进入 /verify full         │
│  ├ 硬验证失败                            │
│  │  → ❌ 必须修复（附具体错误）           │
│  └ 软验证不过                            │
│     → ⚠️ 反馈给 Generator，进入下一轮    │
└────────────────┬────────────────────────┘
                 │ 不达标
                 ▼
┌─────────────────────────────────────────┐
│ Step 6: 反馈循环（最多 max_rounds 轮）   │
│  → Generator 根据 Evaluator 反馈修改     │
│  → 回到 Step 1                          │
│  → 达到上限仍不通过 → 报告给用户决定     │
└─────────────────────────────────────────┘
```

## 触发条件

### 自动触发（Standard+ 模式）
- `/plan` 中包含 `## Acceptance Criteria` 段落时
- 功能实现完成后、准备运行 `/verify` 前

### 手动触发
- 用户在对话中要求评估

### 不触发
- Fast 模式
- 单文件小改
- 纯文档/配置变更

## Evaluator 的标准来源

**关键原则：Agent 执行标准，不发明标准。**

标准按优先级从高到低：

1. **`/plan` 输出的 Acceptance Criteria**（最具体，每个任务不同）
2. **`.claude/rules/common/evaluation-rubric.md`**（通用模板，人维护）
3. **项目已有工具的客观输出**（测试结果、覆盖率、lint 报告）

Evaluator **禁止**：
- 自行发明评分标准
- 给出不基于证据的评价
- 评分高于 B+ 除非有截图 + 测试 + 覆盖率三重证据

## 与现有工具的关系

| 现有工具 | 在本 Skill 中的角色 | 关系 |
|---------|-------------------|------|
| `/verify` | Step 1 硬验证 + 最终确认 | evaluation-loop 是 /verify 的上游增强 |
| `e2e-runner` Agent | Step 2 Playwright 交互 | 被编排调用 |
| `design-review` Skill | Step 3 UI 审查 | 被编排调用 |
| `Reality Checker` Agent | Step 4 独立评估 | 被编排为 Evaluator 角色 |
| `qa-health-score` Skill | 可选——最终评分 | 在 /verify 阶段调用 |
| TDD 流程 | 微观循环（函数级） | evaluation-loop 是宏观循环（功能级） |
| `code-reviewer` Agent | 工程质量审查 | evaluation-loop 之后、/verify 之前 |

```
层级关系：
  TDD (微观：单函数)
    → evaluation-loop (宏观：整个功能)
      → code-review (工程质量)
        → /verify (最终客观检查)
```

## 反馈格式

Evaluator 返回的反馈必须结构化：

```markdown
## Evaluation Round N

### Acceptance Criteria Checklist
- [x] AC-1: 用户可以通过 OAuth 登录 — PASS (截图: oauth-login.png)
- [ ] AC-2: 登录失败显示错误提示 — FAIL (无错误提示，截图: login-error.png)

### Hard Verification
- Build: PASS
- Types: PASS
- Tests: 23/25 PASS (2 failures in auth.test.ts)
- Coverage: 78% (目标 80%)

### Soft Evaluation (参考，不作硬性门槛)
- Functionality: 4/5
- Security: 3/5 — CSRF token 未验证
- Accessibility: N/A (无 UI 变更)

### Verdict: NEEDS WORK
### Required Fixes:
1. auth.test.ts 第 45、67 行测试失败 — 修复 token 刷新逻辑
2. 补充 2% 覆盖率到达 80% 阈值
3. 添加 CSRF token 验证

### Suggested Improvements (可选):
- 考虑添加 rate limiting 到登录接口
```

## 配置

在项目 `.claude/settings.json` 或 CLAUDE.md 中可覆盖默认值：

```
evaluation-loop:
  max_rounds: 3          # 最大反馈轮数
  skip_e2e: false        # 跳过 E2E 步骤
  skip_design: false     # 跳过设计审查
  hard_coverage_min: 80  # 硬性覆盖率下限
```
