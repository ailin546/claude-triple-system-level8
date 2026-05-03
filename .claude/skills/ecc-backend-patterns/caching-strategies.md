# Caching Strategies

## Redis Caching Layer

Wrap your repository with a caching decorator:

```typescript
class CachedMarketRepository implements MarketRepository {
  constructor(
    private baseRepo: MarketRepository,
    private redis: RedisClient
  ) {}

  async findById(id: string): Promise<Market | null> {
    const cached = await this.redis.get(`market:${id}`)
    if (cached) return JSON.parse(cached)

    const market = await this.baseRepo.findById(id)
    if (market) {
      await this.redis.setex(`market:${id}`, 300, JSON.stringify(market))
    }
    return market
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`market:${id}`)
  }
}
```

## Cache-Aside Pattern

Manual cache management for fine-grained control:

```typescript
async function getMarketWithCache(id: string): Promise<Market> {
  const cacheKey = `market:${id}`

  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const market = await db.markets.findUnique({ where: { id } })
  if (!market) throw new Error('Market not found')

  await redis.setex(cacheKey, 300, JSON.stringify(market))
  return market
}
```

**TTL guidelines**:
- Frequently-read, rarely-changed data: 5-15 minutes
- Session data: match session lifetime
- Computed/aggregated values: 1-5 minutes
- Always invalidate on write (`invalidateCache` after update/delete)
