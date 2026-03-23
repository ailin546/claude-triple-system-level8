# 安全审计循环流程

> 改编自 uditgoenka/autoresearch security 子命令，复用 security-reviewer agent 的检查清单。

## 委托 security-reviewer 的审查清单

每轮审计复用 `ecc-security-reviewer.md` 的完整检查：

### OWASP Top 10 检查

1. **Injection** — 查询参数化？用户输入过滤？ORM 安全使用？
2. **Broken Auth** — 密码哈希（bcrypt/argon2）？JWT 验证？Session 安全？
3. **Sensitive Data** — HTTPS 强制？Secrets 在 env vars？PII 加密？日志脱敏？
4. **XXE** — XML 解析器安全配置？外部实体禁用？
5. **Broken Access** — 每个路由检查 auth？CORS 正确配置？
6. **Misconfiguration** — 默认凭证已改？生产环境 debug 关闭？安全头设置？
7. **XSS** — 输出转义？CSP 设置？框架自动转义？
8. **Insecure Deserialization** — 用户输入安全反序列化？
9. **Known Vulnerabilities** — 依赖更新？npm audit 清洁？
10. **Insufficient Logging** — 安全事件记录？告警配置？

### 危险代码模式

| 模式 | 严重度 | 修复 |
|------|--------|------|
| 硬编码 secrets | CRITICAL | 使用 `process.env` |
| 用户输入的 shell 命令 | CRITICAL | 使用安全 API 或 execFile |
| 字符串拼接的 SQL | CRITICAL | 参数化查询 |
| `innerHTML = userInput` | HIGH | 使用 textContent 或 DOMPurify |
| `fetch(userProvidedUrl)` | HIGH | 白名单限制域名 |
| 明文密码比较 | CRITICAL | 使用 bcrypt.compare() |
| 路由无 auth 检查 | CRITICAL | 添加认证中间件 |
| 余额检查无锁 | CRITICAL | 事务中使用 FOR UPDATE |
| 无速率限制 | HIGH | 添加 express-rate-limit |
| 日志中记录密码 | MEDIUM | 脱敏日志输出 |

## 4 种对抗视角

循环中轮换使用不同视角，确保全面覆盖：

### 视角 1: 外部攻击者
- 扫描公开接口（API 端点、表单、URL 参数）
- 尝试常见攻击向量（SQL 注入、XSS、路径遍历）
- 检查错误消息是否泄露内部信息

### 视角 2: 恶意内部人员
- 拥有合法凭证
- 尝试越权操作（水平/垂直权限提升）
- 检查是否能访问其他用户数据

### 视角 3: 供应链攻击者
- 检查依赖的已知漏洞（npm audit / pip-audit）
- 检查锁文件完整性
- 检查后安装脚本

### 视角 4: 自动化扫描器
- 系统性枚举所有端点
- 对每个输入字段尝试所有注入类型
- 检查所有配置文件的默认值

## 循环终止条件

- 所有 CRITICAL 和 HIGH 漏洞已修复
- 剩余仅为 MEDIUM/LOW（可接受风险）
- 达到 --iterations 上限
- 连续 3 轮未发现新漏洞
