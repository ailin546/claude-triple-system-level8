# 自主循环协议详解

> 改编自 uditgoenka/autoresearch 的 8 阶段循环。

## 完整协议

autoloop 的 11 步循环是对 uditgoenka 8 阶段协议的扩展：

| uditgoenka 阶段 | autoloop Phase | 扩展内容 |
|-----------------|----------------|---------|
| REVIEW | Phase 3 | 增加读取 results.jsonl 历史 |
| IDEATE | Phase 4 | 增加去重（排除已失败方向） |
| MODIFY | Phase 5 | 强制原子变更 + experiment: 前缀 |
| COMMIT | (合并到 Phase 5) | — |
| VERIFY | Phase 6 | 复用 verification-before-completion 5 步协议 |
| DECIDE | Phase 7 | 增加崩溃修复路径 |
| LOG | Phase 8 | 使用 JSONL + shared-state-sync 格式 |
| REPEAT | Phase 9-10 | 增加多终止条件检查 |

## 不变量

以下条件在循环的任何时刻都必须成立：

1. **原子性** — 每次迭代只改一件事
2. **可回滚性** — 每次变更都有对应的 git commit，可 revert
3. **可追溯性** — 每次决策都记录在 results.jsonl 和 decisions.log
4. **单调性** — 保留的变更必须使指标单调改进（或至少不退步）
5. **隔离性** — /freeze 确保不修改 scope 之外的文件

## 状态机

```
PRECONDITION → CONFIGURE → BASELINE
                              ↓
                    ┌→ REVIEW → IDEATE → MODIFY → VERIFY → GUARD → DECIDE ─┐
                    │                                          ↓   keep     │
                    │                                        LOG            │
                    │                                          ↓            │
                    │                                        CHECK          │
                    │                                     ↙        ↘       │
                    │                               continue      terminate │
                    └────────────────────────────────┘                ↓     │
                                                                   END     │
                                                                     ↑     │
                                                                     └─────┘
                                                                   discard
```
