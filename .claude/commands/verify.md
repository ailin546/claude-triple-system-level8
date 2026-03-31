---
description: Run comprehensive verification on current codebase state.
mode: Fast / Standard / Heavy (所有模式)
when: 准备宣称完成、合并前检查、接口/配置/行为变更后
not_when: 无（任何完成前都应验证）
prev: /tdd 或 /code-review
next: git commit
heavy_deps: 无
---

# Verification Command

Run comprehensive verification on current codebase state.

## Instructions

Execute verification in this exact order:

1. **Build Check**
   - Run the build command for this project
   - If it fails, report errors and STOP

2. **Type Check**
   - Run TypeScript/type checker
   - Report all errors with file:line

3. **Lint Check**
   - Run linter
   - Report warnings and errors

4. **Test Suite**
   - Run all tests
   - Report pass/fail count
   - Report coverage percentage

5. **Console.log Audit**
   - Search for console.log in source files
   - Report locations

6. **Git Status**
   - Show uncommitted changes
   - Show files modified since last commit

## Output

Produce a concise verification report:

```
VERIFICATION: [PASS/FAIL]

Build:    [OK/FAIL]
Types:    [OK/X errors]
Lint:     [OK/X issues]
Tests:    [X/Y passed, Z% coverage]
Secrets:  [OK/X found]
Logs:     [OK/X console.logs]

Ready for PR: [YES/NO]
```

If any critical issues, list them with fix suggestions.

## Arguments

$ARGUMENTS can be:
- `quick` - Only build + types
- `full` - All checks (default)
- `pre-commit` - Checks relevant for commits
- `pre-pr` - Full checks + security scan; if `/plan` has Acceptance Criteria → auto-trigger `evaluation-loop`
- `fault` - Fault scenario analysis (see below)

## Fault Mode (`/verify fault`)

When `$ARGUMENTS` is `fault`, skip the standard pipeline and run fault scenario analysis instead:

1. **Run fault-scenarios scanner**
   ```bash
   node "${CLAUDE_PROJECT_ROOT:-.}/.claude/scripts/hooks/fault-scenarios.js"
   ```
   - By default scans only git-modified files
   - Pass `--all` to scan the entire project

2. **Interpret results**
   - CRITICAL: empty catch blocks, swallowed errors → must fix before commit
   - HIGH: fetch/HTTP without timeout, DB calls without error handling → should fix
   - MEDIUM: missing input validation, unhandled promises → recommended fix

3. **Output format**
   ```
   FAULT VERIFICATION: [PASS/FAIL]

   Files scanned: N
   Issues:       N (CRITICAL: X, HIGH: Y, MEDIUM: Z)

   [Issue details with file:line and fix suggestions]

   Ready for PR: [YES/NO]
   ```

4. **Blocking rule**: Any CRITICAL issue blocks the PR. HIGH issues produce a warning.
