# Evaluation Rubric（人维护，Agent 执行）

> 本文件定义 evaluation-loop skill 中 Evaluator 使用的评分标准。
> **Agent 只按此标准打分，不得自行发明标准。**
> `/plan` 中的 Acceptance Criteria (AC) 优先级高于本文件。

## 0. Evaluator 输出格式

评估结果必须以结构化 JSON 输出：

```json
{
  "status": "PASS | FAIL | REWORK",
  "hard_gates_passed": true,
  "scores": { "frontend": null, "backend": null, "code_quality": 4 },
  "failed_gates": [],
  "evidence": ["test report path", "screenshot path"],
  "actionable_feedback": "具体改什么、怎么改（一句话）"
}
```

## 1. 硬性门槛（命中任意一条 → FAIL，无例外）

| 门槛 | 判定方式 | 证据要求 |
|------|---------|---------|
| Build | 构建退出码 ≠ 0 → FAIL | build log |
| Type Safety | 类型错误 > 0 → FAIL | tsc/clippy 输出 |
| Test Coverage | < 项目阈值（默认 80%）→ FAIL | 测试报告 |
| MUST AC | `/plan` 中 MUST 条目未满足 → FAIL | 逐条对比 |
| CRITICAL Security | 硬编码密钥、SQL 拼接、明文越权 → FAIL | 扫描结果或代码引用 |

**硬性门槛不打分——只有 PASS/FAIL，不存在"差不多算过"。**

## 2. 代码质量维度（所有项目必查，0-5 分）

| 分数 | 标准 |
|------|------|
| 0 | 严重问题：死循环、资源泄漏、逻辑反转 |
| 1-2 | 能跑但有坏味道：过度抽象、冗余防御、复制粘贴、不必要的 wrapper |
| 3 | 基线：逻辑正确、命名清晰、函数 <50 行、文件 <800 行 |
| 4 | 良好：边界处理完整、错误路径有明确响应、无 lint 警告 |
| 5 | 需要压倒性证据：结构优雅且有完整测试覆盖每个分支 |

**AI Slop 检查**（扣分项，适用于所有项目类型）：
- 过度抽象（只用一次的 helper/wrapper）→ -1
- 虚假错误处理（catch 了但没做任何有意义的事）→ -1
- 不必要的注释（代码已经自解释）→ -0.5
- 千篇一律的模板代码未定制 → -1

## 3. 前端维度（UI 变更时附加，需 Playwright 截图证据）

### 核心 4 维度（源自 Anthropic Harness Design）

| 维度 | 分值 | 具体标准 |
|------|------|---------|
| Design Quality | 0-5 | 整体视觉一致性：配色和谐、布局有节奏感、元素间距统一、视觉层次清晰；页面作为整体是否有"设计感"而非"拼凑感" |
| Originality | 0-5 | 自定义创意程度：有独特的视觉语言或品牌表达。**扣分项**：未修改的 stock 组件、紫色渐变配白卡、千篇一律的 hero section、明显的模板痕迹（"AI slop"）。**加分项**：自定义插画/动画、独特的交互模式、有记忆点的设计决策 |
| Craft | 0-5 | 视觉打磨质量：间距精确一致、字体层级清晰（不超过 3 种字号）、颜色使用克制（主色 + 辅色 + 中性色）、对齐严谨、微交互流畅（hover/focus/transition）。使用设计变量而非硬编码值 |
| Functionality | 0-5 | 界面可用性：所有交互按预期工作；表单提交、导航、状态变化正确；加载/空/错误状态都有处理；无死链或 404 |

### 补充维度

| 维度 | 分值 | 具体标准 |
|------|------|---------|
| Accessibility | 0-3 | WCAG AA 合规：对比度 ≥ 4.5:1、焦点可见、alt 文本、ARIA 标签、触控目标 ≥ 44px |
| Responsive | 0-2 | 320px-1920px 适配；移动端无水平滚动；关键断点布局合理 |

**前端总分 25，≥18 通过，<12 返工。无截图证据时任何维度最高 3 分。**

## 4. 后端维度（API/服务端变更时附加）

| 维度 | 分值 | 3 分基线 | 5 分要求 |
|------|------|---------|---------|
| Correctness | 0-5 | Happy path 正确，基本字段完整 | 边界/并发/极值全部正确处理 |
| Performance | 0-5 | 列表有分页，无明显低效 | 无 N+1，索引合理，关键路径低延迟 |
| Security | 0-5 | Token 校验 + 参数化查询 | Rate limiting + BOLA/IDOR 防护 |
| Idempotency | 0-3 | 写操作基本幂等 | 状态机/幂等键，重试绝对安全 |
| Error Response | 0-2 | 格式统一 | 脱敏 + RFC 7807 规范 |

**满分 20，≥14 通过，<10 返工。Security/Correctness 得 0 分则整体 FAIL。**

## 5. 软性参考（不强制 FAIL，仅建议）

- 前端/后端维度得分 10-13（勉强通过，建议优化）
- `/plan` 中 SHOULD 条目
- 性能优化、文档补充、日志完善

## 6. Evaluator 行为约束

- **禁止自评**：Generator 和 Evaluator 必须是不同 agent；检测到自评时终止循环并报错
- **禁止无证据高分**：无测试/截图证据时，领域维度最高 3 分
- **禁止绕过硬性门槛**：任何理由都不能跳过 Section 1
- **禁止轻易满分**：5 分需要压倒性证据（Reality Checker 原则）
- **必须给可执行反馈**：不能只说"需要改进"，必须指明文件、行号和具体修改方案

## 7. 维护指南

- 由人类维护，Agent 不得修改本文件
- 新增维度必须定义：评分锚点 + 证据要求 + 3 分基线
- 高频 bug（出现 3+ 次）应抽象为新的硬性门槛或评分扣分项
- 修改后自动生效，无需重启
