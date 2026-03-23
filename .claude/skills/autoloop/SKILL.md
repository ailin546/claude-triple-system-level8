---
name: autoloop
description: 自主目标驱动迭代循环。修改→验证→保留/回滚→重复。适用于任何可量化目标。
version: 1.0.0
---

# Autoloop — 目标驱动优化循环

> 第 7 种 Loop 模式（与已归档的 6 种任务编排模式正交）。
> 侧重于**数值优化**：单一指标驱动的假设→验证→保留/回滚循环。

## 定位

| 已有模式（归档） | autoloop |
|-----------------|----------|
| Sequential Pipeline / NanoClaw / Infinite Loop / PR / De-Sloppify / DAG | 目标驱动优化循环 |
| 侧重任务编排 | 侧重数值指标优化 |
| 完成条件：任务完成 | 完成条件：指标达标或平台期 |

## 核心循环协议（11 步）

```
Phase 0:  PRECONDITION — 检查 git 仓库、干净工作树、stale lock
Phase 1:  CONFIGURE   — 定义 scope/metric/direction/verify/guard/budget
Phase 2:  BASELINE    — 运行 verify 建立基线，/checkpoint create autoloop-baseline，/freeze <scope>
Phase 3:  REVIEW      — 读 git log -20 + results.jsonl + 当前代码（每轮必做）
Phase 4:  IDEATE      — 基于 git 历史选择下一个假设（避免重复失败）
Phase 5:  MODIFY      — 做一个原子变更，git commit（experiment: 前缀）
Phase 6:  VERIFY      — 复用 verification-before-completion 的 5 步协议（见下），解析数值指标
Phase 6.5: GUARD      — 如有 guard，运行 guard（失败则重做最多 2 次）
Phase 7:  DECIDE      — 改进+guard通过→保留 | 退步→revert | 崩溃→修复
Phase 8:  LOG         — 追加 results.jsonl + decisions.log
Phase 9:  CHECK       — 终止条件检查（迭代上限/平台期/漂移/成本/目标达成）
Phase 10: REPEAT      — 回到 Phase 3
```

## Phase 详细说明

### Phase 0: PRECONDITION

```bash
# 必须在 git 仓库中
git rev-parse --is-inside-work-tree || ABORT "Not a git repository"

# 工作树必须干净
[ -z "$(git status --porcelain)" ] || ABORT "Uncommitted changes detected"

# 检查 stale lock
[ ! -f .claude/experiments/config.json ] || WARN "Previous experiment config found"
```

### Phase 1: CONFIGURE

接收配置参数（来自命令参数或交互式向导）：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `Goal` | string | 必填 | 优化目标的自然语言描述 |
| `Scope` | glob | 必填 | 可修改的文件范围 |
| `Metric` | string | 必填 | 指标名称 |
| `Direction` | enum | 必填 | `higher` 或 `lower` |
| `Verify` | command | 必填 | 输出数值的评估命令 |
| `Guard` | command | 可选 | 回归防护命令（pass/fail） |
| `Iterations` | int | ∞ | 最大轮次，不设则无限 |
| `budget_seconds` | int | 300 | 每轮验证时间预算 |
| `plateau_threshold` | int | 10 | 连续无改进则终止 |
| `Noise` | enum | `none` | `none`/`medium`/`high`，控制多次运行取中位数 |
| `Min-Delta` | float | 0 | 最小改进阈值（低于忽略） |

保存到 `.claude/experiments/config.json`。

### Phase 2: BASELINE

```
1. 运行 Verify 命令，记录基线指标值
2. /checkpoint create autoloop-baseline
3. /freeze <Scope>
4. 初始化 results.jsonl（写入 iteration 0 baseline 记录）
5. 在 decisions.log 追加 [autoloop-NNN] [START] 记录
```

### Phase 3: REVIEW（每轮必做）

```
1. git log --oneline -20  → 了解近期变更
2. 读取 results.jsonl     → 了解实验历史（成功/失败模式）
3. 读取 scope 内关键文件  → 了解当前代码状态
4. 如有 direction.md      → 读取搜索方向指引
```

### Phase 4: IDEATE

```
1. 基于 Phase 3 的信息生成假设
2. 排除已失败的方向（从 results.jsonl 中读取 status=discard 的记录）
3. 优先选择与之前成功方向相关的假设
4. 确保假设是原子的（一句话能解释）
```

### Phase 5: MODIFY

```
1. 执行一个原子变更（只改一件事）
2. git add <changed files>
3. git commit -m "experiment: <一句话描述假设>"
```

> commit 类型 `experiment:` 需在 git-workflow.md 中注册。

### Phase 6: VERIFY（复用 verification-before-completion 协议）

```
1. IDENTIFY — Verify 命令是什么？
2. RUN     — 执行完整的 Verify 命令（新鲜运行，不用缓存）
3. READ    — 完整输出，检查退出码
4. VERIFY  — 解析数值指标，与基线/上轮比较
5. CLAIM   — 记录指标值和 delta

噪声处理（Noise 参数）：
- none:   单次运行
- medium: 3 次运行取中位数
- high:   5 次运行取中位数

最小改进阈值（Min-Delta）：
- delta < Min-Delta → 视为无改进
```

### Phase 6.5: GUARD

```
如果配置了 Guard 命令：
1. 运行 Guard 命令
2. 检查退出码（0=pass, 非0=fail）
3. 如果 fail 且 retry < 2：回到 Phase 5 修复并重试
4. 如果 fail 且 retry >= 2：标记为 discard，revert
```

### Phase 7: DECIDE

```
条件                          → 动作
改进 + guard 通过（或无 guard）→ status=keep，保留 commit
退步或无改进                   → status=discard，git revert HEAD --no-edit
崩溃（verify 命令执行失败）    → 尝试修复，修复失败则 discard
```

### Phase 8: LOG

**results.jsonl**（追加一行）：
```json
{"iteration":N,"timestamp":"ISO-8601","commit":"sha|null","metric":N,"delta":N,"guard":"pass|fail|null","status":"keep|discard|baseline","description":"...","hypothesis":"...","files_changed":["..."],"duration_seconds":N}
```

**decisions.log**（遵循 shared-state-sync 格式）：
```
[2026-03-23T10:05:00Z] [autoloop-001] [DECIDE] iteration N: keep — description (before→after, +delta)
```

### Phase 9: CHECK — 终止条件

```
1. current_iteration >= max_iterations（如有设置）     → 终止
2. 连续 plateau_threshold 轮无改进                     → 终止
3. 漂移分数 ≥ 40%（读取 .claude/.drift-state/）        → 终止
4. 目标达成（指标达到用户设定目标）                     → 终止
5. 用户中断（Ctrl+C）                                  → 终止
6. 每 5 轮调用 /verify quick                            → 通过则继续

如果终止：
- /checkpoint create autoloop-final
- /unfreeze
- 输出实验摘要（总轮次、最佳指标、改进幅度）
- 调用 /qa-health-score 记录趋势（追加到 trend.jsonl）
```

## 与现有系统集成

| autoloop 阶段 | 调用的现有机制 | 说明 |
|--------------|---------------|------|
| Phase 2 | `/checkpoint create` | 创建基线快照 |
| Phase 2 | `/freeze <scope>` | 锁定编辑范围 |
| Phase 6 | `verification-before-completion` 5 步协议 | 验证指标 |
| Phase 8 | `shared-state-sync` decisions.log 格式 | 记录决策 |
| Phase 9 | `.claude/.drift-state/{session}.json` | 读取漂移分数 |
| Phase 9 | `/verify quick` | 每 5 轮全面验证 |
| 结束 | `/checkpoint create` + `/unfreeze` | 保存终态、解锁 |
| 结束 | `/qa-health-score` | 记录健康评分趋势 |

## 卡住恢复（连续 >5 次 discard）

参考 `agents-archive/ecc-loop-operator.md` 的停滞检测机制：

1. 重读所有 scope 内文件
2. 重读原始 goal/direction.md
3. 审查完整 results.jsonl 找模式（哪些方向成功、哪些失败）
4. 尝试组合之前成功的变更
5. 尝试与失败方向相反的操作
6. 缩小范围（scope-narrowing：聚焦于最有可能改进的子集）
7. 如仍卡住，暂停并请求用户指导

## 子命令

| 子命令 | 用途 | 委托机制 |
|--------|------|---------|
| `/autoloop:debug` | 自主 bug 猎杀 | 每轮委托 systematic-debugging 4 阶段，遵循 3-try 停止 |
| `/autoloop:fix` | 自主错误修复 | 作为 /build-fix 泛化超集，构建错误委托 build-fix |
| `/autoloop:security` | 自主安全审计 | 每轮委托 security-reviewer 审查清单 |
| `/autoloop:predict` | 多人格预测辩论 | 使用 dispatching-parallel-agents 调度 |
| `/autoloop:scenario` | 12 维场景探索 | 参考 test-pressure-*.md 维度 + fault-scenarios |

## 数据格式

所有实验数据使用 **JSONL 格式**（与 `~/.claude/metrics/costs.jsonl` 一致）。

存储位置：
```
.claude/experiments/
├── config.json        ← 当前实验配置
├── results.jsonl      ← 实验结果日志（JSONL，gitignored）
└── direction.md       ← 搜索方向指引（用户编写）
```
