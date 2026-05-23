---
name: evaluation-loop
description: Use after Heavy-mode feature implementation, before /verify — runs an independent Generator-Evaluator (GAN-style) loop that separates generation from evaluation to prevent self-approval bias.
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
│  → 根据项目类型选择 Reality Checker:     │
│    - 存在 Cargo.toml / go.mod / CMake   │
│      且不存在 index.html / resources/    │
│      views/  → `Reality Checker          │
│      (Systems)` agent                    │
│      (testing-reality-checker-systems)   │
│    - 否则(web/UI 项目) → `Reality        │
│      Checker` agent                       │
│      (testing-reality-checker)           │
│  → 输入：Step 1-3 的结果 + /plan 验收标准│
│  → 逐条对照 acceptance criteria          │
│  → 默认态度：NEEDS WORK                  │
│  → 背景: Web 版的 Reality Checker 会在   │
│    Rust 项目上对空目录 grep/Playwright  │
│    截图 → 无证据自动 PASS → 静默失效    │
│    (2026-04-19 独立审查抓到的 Gap #1)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Step 4.5: 运行期 deploy 验证(可选,P1)    │
│  Wave 15 R3 (2026-05-21)— 来源:         │
│    Wave 14 P1 chain Codex round 0       │
│    静态 review 全 PASS 但实跑炸          │
│    (commit ba7756e → revert 80ada6f)。 │
│  适用:Heavy 模式有 dev/staging 环境的    │
│    项目(CCHFT 的 Mac dev 9100 端口、    │
│    Linux prod 等)。Pure-types/纯文档    │
│    任务跳过。                            │
│  步骤:                                   │
│  ① Generator 在 dev/staging 启动服务:    │
│     CCHFT 类项目:`./restart.sh master+   │
│       worker` + `./restart.sh hedge`    │
│     Web 类项目:`npm run dev` 或 docker  │
│  ② 监听 30s 实时日志,grep:               │
│     - ERROR / FATAL / PANIC / unwrap   │
│     - 已知 fatal 关键词(如 "no Venue    │
│       Config","engine refuses to       │
│       spawn","auth dropped during      │
│       send_order")                      │
│     - 跨进程 mismatch(master 警告 vs    │
│       worker 拒绝)                      │
│  ③ 若发现 ERROR → 报告 + 触发 Step 6     │
│     反馈循环;否则继续 Step 5。          │
│  注意: 仅检测 30s 窗口内的明显 ERROR;   │
│    长时 soak (>10min) / 24h 验证 仍属  │
│    /verify 阶段后的独立任务。           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Step 5: 判定                             │
│  ├ 硬验证通过 + Reality Checker 通过     │
│  │  → ✅ 接受                            │
│  │     写 pass marker(见 Step 5.5)      │
│  │     进入 /verify full                │
│  ├ 硬验证失败                            │
│  │  → ❌ 必须修复（附具体错误）           │
│  └ 软验证不过                            │
│     → ⚠️ 反馈给 Generator，进入下一轮    │
└────────────────┬────────────────────────┘
                 │ Accepted
                 ▼
┌─────────────────────────────────────────┐
│ Step 5.5: Evaluation-Gate 写 marker    │
│  Claude 用 Write tool 写:               │
│    ~/.claude/state/evaluation-gate/     │
│        last-pass.json                   │
│  必填 schema(缺字段 hook 会 block):      │
│  {                                      │
│    "ts": <Date.now()>,                  │
│    "git_head": "<git rev-parse --short  │
│                 HEAD 的输出>",            │
│    "mode": "heavy",                     │
│    "round": <N>,                        │
│    "evaluator_agent_id": "<Task tool   │
│      spawn 的 Reality Checker agent     │
│      id,从 completion notification     │
│      读取>",                             │
│    "verdict_summary": "<Reality         │
│      Checker 返回原文中 ACCEPTED 的      │
│      一行摘要,至少 10 字符>"              │
│  }                                      │
│  作用: 解除 evaluation-gate hook 的     │
│        commit/push 阻断。2h TTL +       │
│        git_head 校验(代码一旦变化        │
│        marker 立即失效)。                │
│  反作弊: 跳过 Step 5.5 或伪造空 marker  │
│          会在 commit 时被 hook 拦住。    │
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
2. **`~/.claude/on-demand/evaluation-rubric.md`**（通用模板，人维护；skill 启动时必须 Read 加载）
3. **项目已有工具的客观输出**（测试结果、覆盖率、lint 报告）

Evaluator **禁止**：
- 自行发明评分标准
- 给出不基于证据的评价
- 违反 `~/.claude/on-demand/evaluation-rubric.md` 中的禁止行为（包括无压倒性证据给满分）

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
| `ecc-eval-harness` Skill | 开发阶段 eval 框架（pass@k） | 互补：eval-harness 管"能力回归测试"，evaluation-loop 管"功能验收循环" |

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
