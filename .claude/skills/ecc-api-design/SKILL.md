---
name: ecc-api-design
description: "Use when designing or reviewing REST API endpoints — covers resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting for production APIs. For broader backend service patterns (database, caching, jobs) use ecc-backend-patterns."
---

# API Design Patterns

Conventions and best practices for designing consistent, developer-friendly REST APIs.

## When to Activate

- Designing new API endpoints
- Reviewing existing API contracts
- Adding pagination, filtering, or sorting
- Implementing error handling for APIs
- Planning API versioning strategy
- Building public or partner-facing APIs

## Topics

| Topic | File | Contents |
|-------|------|----------|
| Resource Design | [resources.md](resources.md) | URL structure, naming rules, CRUD conventions |
| HTTP Methods & Status Codes | [status-codes.md](status-codes.md) | Method semantics, status code reference, common mistakes |
| Response Format | [responses.md](responses.md) | Success/error/collection response shapes, envelope variants |
| Pagination, Filtering, Sorting | [pagination.md](pagination.md) | Offset vs cursor pagination, filtering, sorting, sparse fieldsets |
| Auth & Rate Limiting | [auth.md](auth.md) | Token-based auth, authorization patterns, rate limit headers/tiers |
| Versioning & Checklist | [versioning.md](versioning.md) | URL vs header versioning, deprecation strategy, pre-ship checklist |
| Implementation Examples | [implementation.md](implementation.md) | TypeScript, Python, Go code examples |

## Quick Reference

**URL Rules:** Plural nouns, kebab-case, no verbs in paths. Use query params for filtering.

**Status Codes:** 200 GET/PUT/PATCH, 201 POST (+ Location header), 204 DELETE, 400/422 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 429 rate limit.

**Response Shape:** Always wrap in `data` for single resources; add `meta` + `links` for collections. Errors use `error.code` + `error.message` + optional `error.details[]`.

**API Design Checklist** (pre-ship):
- [ ] Plural, kebab-case URL; no verbs
- [ ] Correct HTTP method and status code
- [ ] Input schema validated (Zod / Pydantic)
- [ ] Error response with `code` + `message` + `details`
- [ ] Pagination on list endpoints
- [ ] Auth + authorization checked
- [ ] Rate limiting configured
- [ ] No internal details leaked in errors
- [ ] OpenAPI spec updated
