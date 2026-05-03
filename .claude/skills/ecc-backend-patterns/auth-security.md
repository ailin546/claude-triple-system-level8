# Authentication & Authorization

## JWT Token Validation

```typescript
import jwt from 'jsonwebtoken'

interface JWTPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
  } catch {
    throw new ApiError(401, 'Invalid token')
  }
}

export async function requireAuth(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) throw new ApiError(401, 'Missing authorization token')
  return verifyToken(token)
}

export async function GET(request: Request) {
  const user = await requireAuth(request)
  const data = await getDataForUser(user.userId)
  return NextResponse.json({ success: true, data })
}
```

## Role-Based Access Control (RBAC)

```typescript
type Permission = 'read' | 'write' | 'delete' | 'admin'
interface User { id: string; role: 'admin' | 'moderator' | 'user' }

const rolePermissions: Record<User['role'], Permission[]> = {
  admin: ['read', 'write', 'delete', 'admin'],
  moderator: ['read', 'write', 'delete'],
  user: ['read', 'write']
}

export function hasPermission(user: User, permission: Permission): boolean {
  return rolePermissions[user.role].includes(permission)
}

export function requirePermission(permission: Permission) {
  return (handler: (request: Request, user: User) => Promise<Response>) =>
    async (request: Request) => {
      const user = await requireAuth(request)
      if (!hasPermission(user, permission)) {
        throw new ApiError(403, 'Insufficient permissions')
      }
      return handler(request, user)
    }
}

export const DELETE = requirePermission('delete')(
  async (request, user) => new Response('Deleted', { status: 200 })
)
```

## Rate Limiting

Simple in-memory rate limiter (use Redis for multi-instance deployments):

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>()

  async checkLimit(identifier: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const now = Date.now()
    const recentRequests = (this.requests.get(identifier) || []).filter(t => now - t < windowMs)
    if (recentRequests.length >= maxRequests) return false
    recentRequests.push(now)
    this.requests.set(identifier, recentRequests)
    return true
  }
}

const limiter = new RateLimiter()

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  if (!await limiter.checkLimit(ip, 100, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  // Continue with request
}
```
