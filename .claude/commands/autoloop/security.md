---
name: autoloop:security
description: 自主安全审计循环。STRIDE + OWASP 检查，迭代修复发现的漏洞。
argument-hint: "[Scope: <glob>] [--iterations N] [--severity critical|high|medium|all]"
---

# /autoloop:security — 自主安全审计循环

> 每轮委托 `security-reviewer` agent 的审查清单，迭代修复发现的漏洞。

## 与 security-reviewer 的关系

| security-reviewer | autoloop:security |
|-------------------|-------------------|
| 单次审查，输出报告 | 审查→修复→重新审查循环 |
| 发现问题 | 发现并修复问题 |
| 手动触发 | 自动循环直到清洁 |

## 循环协议

```
Phase 1: AUDIT
  委托 security-reviewer 执行完整审查：
  1. Initial Scan — 扫描 scope 内文件
  2. OWASP Top 10 Check — 逐项检查
     - Injection, Broken Auth, Sensitive Data, XXE
     - Broken Access, Misconfiguration, XSS
     - Insecure Deserialization, Known Vulns, Logging
  3. Code Pattern Review — 匹配已知危险模式

Phase 2: PRIORITIZE
  按 severity 排序：CRITICAL → HIGH → MEDIUM
  如果 --severity 指定了过滤级别，只处理该级别及以上

Phase 3: FIX LOOP
  For each vulnerability:
    1. Read — 读取漏洞所在代码
    2. Fix — 应用安全修复（参考 security-reviewer 的 Fix 建议）
    3. Commit — experiment: security-fix — <漏洞描述>
    4. Re-audit — 重新扫描确认修复有效且未引入新漏洞

  Guardrails:
    - 修复引入新漏洞 → revert 并尝试替代方案
    - 同一漏洞 3 次修复失败 → 标记为 needs_review，跳过
    - 修复需要架构变更 → 停止并提问

Phase 4: SUMMARY
  - 已修复漏洞数（按 severity）
  - 剩余未修复漏洞
  - needs_review 项目列表
  - OWASP 合规状态
```

## 对抗人格（4 种视角）

每轮审计可选用不同视角：

1. **外部攻击者** — 从公开接口寻找入口
2. **恶意内部人员** — 拥有合法凭证，尝试越权
3. **供应链攻击者** — 通过依赖注入恶意代码
4. **自动化扫描器** — 系统性枚举所有已知漏洞模式

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `Scope` | 当前项目 | 审计范围 |
| `--iterations` | ∞ | 最大审计轮次 |
| `--severity` | `all` | 最低处理级别 |

## 示例

```
/autoloop:security Scope: src/auth/**/*.ts --severity critical

/autoloop:security --iterations 5

/autoloop:security Scope: api/**/*.py --severity high
```
