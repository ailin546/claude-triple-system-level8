# Evaluation Rubric（人维护，Agent 执行）

> 本文件定义 evaluation-loop skill 中 Evaluator 使用的评分标准。
> **Agent 只按此标准打分，不得自行发明标准。**
> 项目特定标准应在 `/plan` 的 Acceptance Criteria 中定义，优先级高于本文件。

## 通用维度

所有项目类型适用的基础检查：

| 维度 | 评分方式 | 说明 |
|------|---------|------|
| Plan Compliance | 逐条 PASS/FAIL | `/plan` 中 Acceptance Criteria 每条是否满足 |
| Test Coverage | 数字 (%) | 必须 ≥ 项目设定阈值（默认 80%） |
| Build Health | PASS/FAIL | 构建是否成功 |
| Type Safety | 数字 (errors) | 类型错误数，目标 0 |
| Security | PASS/FAIL per item | OWASP Top 10 对应检查项 |

## 前端评审维度

UI/前端变更时附加评估（需要 Playwright 截图证据）：

| 维度 | 分值 | 具体标准 |
|------|------|---------|
| Functionality | 0-5 | 所有交互按预期工作；表单提交、导航、状态变化正确 |
| Accessibility | 0-5 | WCAG AA 合规：对比度 ≥ 4.5:1、焦点可见、alt 文本、ARIA 标签、触控目标 ≥ 44px |
| Responsive | 0-5 | 320px-1920px 全范围适配；移动端无水平滚动；关键断点布局合理 |
| No AI Slop | 0-3 | 无默认紫色渐变/白卡堆砌/stock 组件未修改/千篇一律的 hero section |
| Design Tokens | 0-2 | 无硬编码颜色、间距、字体；全部使用设计变量 |

**前端总分**：20 分制，≥ 14 分通过，< 10 分必须返工

## 后端评审维度

API/服务端变更时附加评估：

| 维度 | 分值 | 具体标准 |
|------|------|---------|
| Correctness | 0-5 | 边界条件处理；错误路径有明确响应；无静默吞错 |
| Performance | 0-5 | 无 N+1 查询；有必要索引；批量操作有分页 |
| Security | 0-5 | 输入验证；参数化查询；认证/授权检查；rate limiting |
| Idempotency | 0-3 | 写操作幂等；重试安全；无重复副作用 |
| Error Response | 0-2 | 一致的错误响应格式；不泄露内部信息 |

**后端总分**：20 分制，≥ 14 分通过，< 10 分必须返工

## 评分规则

### 硬性门槛（不通过则 FAIL，无例外）

- Build 失败
- 类型错误 > 0
- 测试覆盖率 < 项目阈值
- `/plan` Acceptance Criteria 中标记为 MUST 的条目未满足
- CRITICAL 级安全问题

### 软性参考（不通过仅建议修改）

- 前端/后端维度评分
- Acceptance Criteria 中标记为 SHOULD 的条目
- 性能优化建议

### 禁止行为

- Evaluator 不得给自己生成的代码评分（Generator ≠ Evaluator）
- Evaluator 不得忽略硬性门槛直接通过
- Evaluator 不得在无截图/测试证据的情况下给前端维度打 4+ 分
- Evaluator 不得评分 A+ / 满分，除非有压倒性证据（Reality Checker 原则）

## 维护指南

本文件由**人类维护**：
- 项目初始化时根据项目类型选择适用维度
- 定期根据项目经验调整分值和标准
- 新增维度时必须定义具体的、可验证的评分标准（不接受"代码好不好"这种模糊描述）
- 修改本文件后无需重启——下次 evaluation-loop 自动使用新标准
