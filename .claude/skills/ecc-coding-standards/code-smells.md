# Code Smell Detection

Watch for these anti-patterns and fix them proactively.

## 1. Long Functions

Keep functions under 50 lines. Split larger ones into smaller, named functions.

```typescript
// BAD: Function > 50 lines
function processMarketData() {
  // 100 lines of code
}

// GOOD: Split into smaller functions
function processMarketData() {
  const validated = validateData()
  const transformed = transformData(validated)
  return saveData(transformed)
}
```

## 2. Deep Nesting

Prefer early returns over deeply nested conditionals (max 4 levels).

```typescript
// BAD: 5+ levels of nesting
if (user) {
  if (user.isAdmin) {
    if (market) {
      if (market.isActive) {
        if (hasPermission) { /* Do something */ }
      }
    }
  }
}

// GOOD: Early returns
if (!user) return
if (!user.isAdmin) return
if (!market) return
if (!market.isActive) return
if (!hasPermission) return
// Do something
```

## 3. Magic Numbers

Replace unexplained literals with named constants.

```typescript
// BAD: Unexplained numbers
if (retryCount > 3) { }
setTimeout(callback, 500)

// GOOD: Named constants
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500

if (retryCount > MAX_RETRIES) { }
setTimeout(callback, DEBOUNCE_DELAY_MS)
```

---

**Remember**: Code quality is not negotiable. Clear, maintainable code enables rapid development and confident refactoring.
