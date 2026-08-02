# Code Quality, Testing & Security

> 合并自 `coding-style.md`、`testing.md`、`security.md`。
> 三者同属"写代码时的纪律"，合并后降低加载开销。

## Coding Style

### Glue Code Principle

优先连接，不造新轮子：
- 能用现有组件/库/内部工具组合实现的，不写新逻辑
- 胶水代码专注**连接、数据转换、流程编排**，保持轻量
- 当胶水逻辑变复杂（超过单一职责），立即拆分为独立模块

### Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

### File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

### Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

### Input Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation where available
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

### Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)

---

## Testing Requirements

### Coverage: changed-line coverage（2026-08-02 取代纸面全局 80%）

- **改动行覆盖**：本次改动触碰的行必须被测试执行（工具：cargo-llvm-cov / vitest coverage + diff-cover；CCHFT 落地 `scripts/changed-line-cov.sh` + CI 观测 job）
- 原"全局 ≥80%"退役：该数字长期无任何工具 enforcement（纸面规则制造虚假合规感），且"追逐覆盖率数字"本身是反模式——覆盖率是**探测未测代码的探测器**，不是目标（old-coder anti-gaming #4；用户批准 T-old-coder A3/B5）
- 风控/安全逻辑仍要求 100% 分支覆盖
- **变异验证**（safety-critical 改动）：测试必须证明"真能失败"——注入 plausible bug 确认测试变红（`manual mutation: N/N killed` 证据行），工具版 cargo-mutants

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language)

### Test-Driven Development

Standard+ 模式下的功能开发和有明确 AC 的 bugfix 使用 TDD 流程。
Fast 模式下的小修复、配置微调、文档变更不强制 TDD。

TDD 流程（当适用时）：
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

### Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

### Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first

---

## Security Guidelines

### Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

### Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed

### Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues
