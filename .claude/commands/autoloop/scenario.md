---
name: autoloop:scenario
description: 12 维场景探索。系统性发现边缘用例和故障场景。
argument-hint: "[Scope: <glob>] [--dimensions N] [--depth shallow|deep]"
---

# /autoloop:scenario — 12 维场景探索

> 系统性边缘用例发现，参考 `test-pressure-*.md` 维度模板和 `fault-scenarios.js` 扫描模式。

## 与现有机制的关系

| test-pressure-*.md | fault-scenarios.js | autoloop:scenario |
|--------------------|-------------------|-------------------|
| 手工编写场景 | 自动扫描 5 种模式 | 12 维自动生成 |
| 验证调试流程 | 检测故障模式 | 发现边缘用例 |
| 固定场景 | 固定模式 | 动态探索 |

## 12 维度探索框架

```
维度 1:  NULL/EMPTY    — 空值、空字符串、空数组、null、undefined
维度 2:  BOUNDARY      — 最大值、最小值、零值、溢出、截断
维度 3:  TYPE          — 类型错误、类型强制转换、意外类型
维度 4:  CONCURRENCY   — 竞态条件、死锁、重入、并发写入
维度 5:  NETWORK       — 超时、断连、重试、部分响应、DNS 失败
维度 6:  PERMISSION    — 未授权、越权、角色冲突、令牌过期
维度 7:  STATE         — 无效状态转换、脏数据、缓存失效、幂等性
维度 8:  INJECTION     — SQL 注入、XSS、命令注入、路径遍历
维度 9:  RESOURCE      — 内存不足、磁盘满、文件句柄耗尽、CPU 过载
维度 10: TIME          — 时区、夏令时、闰年、时钟偏移、TTL
维度 11: ENCODING      — Unicode、多字节字符、BOM、编码不匹配
维度 12: DEPENDENCY    — 外部服务不可用、版本不兼容、降级策略
```

## 循环协议

```
Phase 1: SCAN
  - 读取 Scope 内所有文件
  - 识别函数/接口/API 端点/数据流
  - 为每个维度生成初始场景列表

Phase 2: EXPLORE（每个维度）
  For each dimension (1-12):
    For each target (函数/接口/端点):
      1. 生成该维度的具体场景
      2. 评估风险等级（CRITICAL/HIGH/MEDIUM/LOW）
      3. 检查是否已有测试覆盖
      4. 如无覆盖 → 标记为 gap

  深度控制（--depth）：
  - shallow: 每维度仅检查公开接口
  - deep: 递归检查内部函数和数据流

Phase 3: REPORT
  输出结构化报告：

  | 维度 | 场景数 | 已覆盖 | Gap | 高风险 |
  |------|--------|--------|-----|--------|
  | NULL/EMPTY | 15 | 8 | 7 | 3 |
  | BOUNDARY | 12 | 5 | 7 | 5 |
  | ... | ... | ... | ... | ... |

  按风险等级排序的 Top 10 未覆盖场景。

Phase 4: GENERATE（可选）
  如果用户确认，为 Top gap 自动生成测试用例：
  - 使用 TDD 方式（先写测试，再实现修复）
  - 每个场景一个 commit：experiment: scenario-test — <维度>/<场景>
```

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `Scope` | 当前项目 | 探索范围 |
| `--dimensions` | 12 | 探索维度数（1-12） |
| `--depth` | `shallow` | 探索深度 |

## 示例

```
/autoloop:scenario Scope: src/api/**/*.ts --depth deep

/autoloop:scenario --dimensions 6  ← 仅前 6 个维度

/autoloop:scenario Scope: lib/auth/ --depth deep --dimensions 8
```
