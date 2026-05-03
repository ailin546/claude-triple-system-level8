# Performance & Testing Standards

## Performance: Memoization

```typescript
import { useMemo, useCallback } from 'react'

// GOOD: Memoize expensive computations
const sortedMarkets = useMemo(() => {
  return markets.sort((a, b) => b.volume - a.volume)
}, [markets])

// GOOD: Memoize callbacks
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query)
}, [])
```

## Performance: Lazy Loading

```typescript
import { lazy, Suspense } from 'react'

// GOOD: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))

export function Dashboard() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyChart />
    </Suspense>
  )
}
```

## Performance: Database Queries

```typescript
// GOOD: Select only needed columns
const { data } = await supabase
  .from('markets')
  .select('id, name, status')
  .limit(10)

// BAD: Select everything
const { data } = await supabase.from('markets').select('*')
```

## Testing: AAA Pattern

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

## Testing: Test Naming

```typescript
// GOOD: Descriptive test names
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// BAD: Vague test names
test('works', () => { })
test('test search', () => { })
```

Minimum coverage: 80%. Test types required: unit, integration, E2E.
