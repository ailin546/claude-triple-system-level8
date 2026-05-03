# Rate Limiting, Sensitive Data & Dependency Security

## 7. Rate Limiting

### API Rate Limiting
```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests'
})

app.use('/api/', limiter)
```

### Expensive Operations
```typescript
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many search requests'
})

app.use('/api/search', searchLimiter)
```

### Verification Steps
- [ ] Rate limiting on all API endpoints
- [ ] Stricter limits on expensive operations
- [ ] IP-based rate limiting
- [ ] User-based rate limiting (authenticated)

---

## 8. Sensitive Data Exposure

### Logging
```typescript
// Wrong: Logging sensitive data
console.log('User login:', { email, password })

// Correct: Redact sensitive data
console.log('User login:', { email, userId })
console.log('Payment:', { last4: card.last4, userId })
```

### Error Messages
```typescript
// Wrong: Exposing internal details
catch (error) {
  return NextResponse.json(
    { error: error.message, stack: error.stack }, { status: 500 }
  )
}

// Correct: Generic error messages
catch (error) {
  console.error('Internal error:', error)
  return NextResponse.json(
    { error: 'An error occurred. Please try again.' }, { status: 500 }
  )
}
```

### Verification Steps
- [ ] No passwords, tokens, or secrets in logs
- [ ] Error messages generic for users
- [ ] Detailed errors only in server logs
- [ ] No stack traces exposed to users

---

## 10. Dependency Security

### Regular Audits
```bash
npm audit
npm audit fix
npm update
npm outdated
```

### Lock Files
```bash
# Always commit lock files
git add package-lock.json

# Use in CI/CD for reproducible builds
npm ci
```

### Verification Steps
- [ ] Dependencies up to date
- [ ] No known vulnerabilities (npm audit clean)
- [ ] Lock files committed
- [ ] Dependabot enabled on GitHub
- [ ] Regular security updates
