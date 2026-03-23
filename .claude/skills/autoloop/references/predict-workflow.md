# 多人格辩论流程

> 改编自 uditgoenka/autoresearch predict 子命令，复用 dispatching-parallel-agents 的调度模式。

## 调度模式（来自 dispatching-parallel-agents）

每个专家 agent 遵循以下规范：

```
1. 聚焦范围 — 一个明确的视角/约束
2. 自包含上下文 — 包含理解问题所需的全部信息
3. 明确输出格式 — 分析摘要 + 预测 + 信心评分 + 假设列表
```

## 专家视角定义

### 默认 3 专家配置

```
Expert 1 — 乐观主义者
约束：关注机会、正面结果、成功路径
偏好：快速行动、接受合理风险
输出：最佳情况分析 + 行动建议

Expert 2 — 悲观主义者
约束：关注风险、负面结果、失败模式
偏好：谨慎行动、规避风险
输出：最坏情况分析 + 风险缓解建议

Expert 3 — 技术专家
约束：关注可行性、实现细节、技术限制
偏好：数据驱动、证据支撑
输出：技术可行性分析 + 实施路径
```

### 可选扩展（4-5 专家）

```
Expert 4 — 用户代言人
约束：关注用户体验、需求满足度
偏好：用户价值优先
输出：用户影响分析 + UX 建议

Expert 5 — 安全守卫
约束：关注安全、合规、隐私
偏好：安全优先
输出：安全影响分析 + 合规建议
```

## 辩论协议

### Round 1: 独立分析

每位专家独立产出：
```json
{
  "expert": "乐观主义者",
  "analysis": "...",
  "prediction": "...",
  "confidence": 85,
  "key_assumptions": ["假设1", "假设2"],
  "recommendation": "..."
}
```

### Round 2+: 针对性回应

1. 收集所有专家的 Round 1 输出
2. 识别分歧点（confidence 差异 > 20 或 recommendation 相反）
3. 每位专家回应其他人的观点：
   - 同意的点 + 理由
   - 反对的点 + 反驳证据
   - 更新自己的 confidence

### 共识检测

```
标准差 = std([expert.confidence for expert in experts])
if 标准差 < 15:
    → 达成共识
else:
    → 继续下一轮辩论
```

### 反羊群机制

```
if all(expert.recommendation == same_direction):
    → 强制最后一位专家扮演"魔鬼代言人"
    → 质疑共识，提出反面论点
    → 如果反面论点有说服力 → 额外一轮辩论
```

## 最终综合

```
加权建议 = Σ(expert.recommendation × expert.confidence) / Σ(confidence)
```

输出：
1. 综合建议（加权）
2. 各专家最终立场
3. 未解决的分歧列表
4. 关键假设和风险
5. 建议的后续行动
