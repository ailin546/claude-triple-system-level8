---
name: qa-health-score
description: Use after /verify or before PR creation to compute a quantitative 0-100 codebase health score from build/test/lint/security signals.
---

# QA Health Score

Compute a weighted health score across multiple quality dimensions.
Inspired by gstack's QA health scoring mechanism.

## Score Dimensions (0-100 total)

| Dimension | Weight | How to Measure |
|-----------|--------|----------------|
| Build Health | 5% | Does the project build without errors? |
| Test Coverage | 25% | Coverage report percentage (lcov, coverage.py, go cover) |
| Test Pass Rate | 15% | % of tests passing |
| Lint Warnings | 15% | Count of linter warnings (ESLint, Biome, Ruff, golint) |
| Type Safety | 15% | TypeScript/mypy/type checker error count |
| Security Issues | 15% | Known vulnerability count (npm audit, pip-audit, govulncheck) |
| Dead Code | 10% | Unused exports/variables (knip, ts-prune, deadcode) |

## Scoring Formula

Each dimension scores 0-100 independently, then weighted:

```
Build:     pass=100, fail=0
Coverage:  actual_percent (0-100)
Tests:     (passed / total) * 100
Lint:      max(0, 100 - (warnings * 2))
Types:     max(0, 100 - (errors * 10))
Security:  max(0, 100 - (critical*25 + high*10 + medium*5))
DeadCode:  max(0, 100 - (unused_exports * 3))

Final = sum(dimension_score * weight)
```

## Workflow

### Step 1: Detect Project Type

Read `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `build.gradle.kts`
to determine language and available tooling.

### Step 2: Run Checks

Execute available tools (skip unavailable ones, adjust weights):

```bash
# JavaScript/TypeScript
npm run build 2>&1               # Build health
npx jest --coverage 2>&1          # Test coverage + pass rate
npx eslint . --format json 2>&1   # Lint warnings
npx tsc --noEmit 2>&1             # Type errors
npm audit --json 2>&1             # Security

# Python
python -m pytest --cov --tb=short 2>&1
python -m ruff check . 2>&1
python -m mypy . 2>&1
pip-audit --format json 2>&1

# Go
go build ./... 2>&1
go test -cover ./... 2>&1
go vet ./... 2>&1
govulncheck ./... 2>&1
```

### Step 3: Parse Results and Score

Parse each tool's output and compute dimension scores.
If a tool is unavailable, redistribute its weight proportionally.

### Step 4: Output Report

```
## QA Health Score: 78/100

| Dimension      | Score | Weight | Weighted |
|----------------|-------|--------|----------|
| Build          | 100   | 5%     | 5.0      |
| Test Coverage  | 82    | 25%    | 20.5     |
| Test Pass Rate | 100   | 15%    | 15.0     |
| Lint Warnings  | 90    | 15%    | 13.5     |
| Type Safety    | 70    | 15%    | 10.5     |
| Security       | 85    | 15%    | 12.8     |
| Dead Code      | 60    | 10%    | 6.0      |
|                |       | **Total** | **83.3** |

Trend: +5 from last check (2026-03-15)
```

### Step 5: Save History

Save score to `.claude/qa-scores/YYYY-MM-DD.json` for trend tracking.

```json
{
  "date": "2026-03-19",
  "total": 78,
  "dimensions": { "build": 100, "coverage": 82, ... },
  "project": "my-project"
}
```

## Integration

- Called by `verification-before-completion` skill as final quality check
- Called by `/verify` command for on-demand scoring
- History enables trend analysis: "Quality improved 12 points this sprint"
