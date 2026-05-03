---
name: ecc-backend-patterns
description: Use when designing or reviewing backend code — Node.js/Express/Next.js API routes, database access, server-side best practices. For REST endpoint design specifics use ecc-api-design.
---

# Backend Development Patterns

Backend architecture patterns and best practices for scalable server-side applications.

## When to Use

- Designing REST or GraphQL API endpoints
- Implementing repository, service, or controller layers
- Optimizing database queries (N+1, indexing, connection pooling)
- Adding caching (Redis, in-memory, HTTP cache headers)
- Setting up background jobs or async processing
- Structuring error handling and validation for APIs
- Building middleware (auth, logging, rate limiting)

## Topics

| Topic | File | Contents |
|-------|------|----------|
| API & Service Layers | [api-service-layers.md](api-service-layers.md) | RESTful structure, Repository pattern, Service layer, Middleware |
| Database Patterns | [database-patterns.md](database-patterns.md) | Query optimization, N+1 prevention, Transactions |
| Caching Strategies | [caching-strategies.md](caching-strategies.md) | Redis caching, Cache-aside pattern |
| Error Handling | [error-handling.md](error-handling.md) | Centralized error handler, Retry with backoff |
| Auth & Security | [auth-security.md](auth-security.md) | JWT validation, RBAC, Rate limiting |
| Background Jobs | [background-jobs.md](background-jobs.md) | Simple queue pattern, Async processing |
| Logging | [logging.md](logging.md) | Structured logging |

> **Remember**: Choose patterns that fit your complexity level. Avoid over-engineering for simple use cases.
