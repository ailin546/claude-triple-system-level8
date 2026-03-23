---
name: autoloop:predict
description: 多人格预测辩论。3-5 专家独立分析→辩论→共识。
argument-hint: "<question> [--experts N] [--rounds N]"
---

# /autoloop:predict — 多人格预测辩论

> 使用 `dispatching-parallel-agents` 的调度模式，并行运行多个专家视角，
> 通过辩论轮次达成共识。

## 与 dispatching-parallel-agents 的关系

| dispatching-parallel-agents | autoloop:predict |
|---------------------------|------------------|
| 并行独立任务 | 并行+对抗性辩论 |
| 无交互 | 多轮交互 |
| 任务完成即结束 | 达成共识才结束 |

## 辩论协议

```
Phase 1: SETUP
  - 解析问题/预测目标
  - 选择专家视角（3-5 个，默认 3）
  - 每个专家分配不同约束和偏好

Phase 2: INDEPENDENT ANALYSIS（并行）
  使用 dispatching-parallel-agents 调度：

  Expert 1: 乐观视角 — 关注机会和正面结果
  Expert 2: 悲观视角 — 关注风险和负面结果
  Expert 3: 技术视角 — 关注可行性和实现细节
  Expert 4: 用户视角 — 关注用户体验和需求（可选）
  Expert 5: 安全视角 — 关注安全和合规（可选）

  每个专家独立产出：
  - 分析摘要
  - 预测/建议
  - 信心评分（0-100）
  - 关键假设列表

Phase 3: DEBATE（多轮）
  For each round (最多 --rounds 轮):
    1. 收集所有专家的分析
    2. 识别分歧点
    3. 每个专家针对分歧点回应其他专家的观点
    4. 检查共识：如果信心评分标准差 < 15 → 达成共识
    5. 反羊群机制：如果所有专家方向一致 → 强制一位专家质疑

  终止条件：
  - 达成共识（标准差 < 15）
  - 达到最大辩论轮次
  - 用户中断

Phase 4: SYNTHESIS
  - 综合所有视角的共识点
  - 列出未解决的分歧
  - 给出加权最终建议（按信心评分加权）
  - 列出关键假设和风险
```

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `<question>` | 必填 | 预测/决策问题 |
| `--experts` | 3 | 专家数量（3-5） |
| `--rounds` | 3 | 最大辩论轮次 |

## 示例

```
/autoloop:predict "我们应该用 JWT 还是 Session Cookie 做认证？" --experts 4

/autoloop:predict "这个重构方案的风险有多大？" --rounds 5

/autoloop:predict "下一个 sprint 应该优先做什么？"
```
