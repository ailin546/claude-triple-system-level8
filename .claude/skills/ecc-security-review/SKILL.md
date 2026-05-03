---
name: ecc-security-review
description: Use when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features — provides comprehensive security checklist and patterns. For .claude/ config security audit use ecc-security-scan.
---

# Security Review Skill

Ensures all code follows security best practices and identifies potential vulnerabilities before deployment.

## When to Activate

- Implementing authentication or authorization
- Handling user input or file uploads
- Creating new API endpoints
- Working with secrets or credentials
- Implementing payment features
- Storing or transmitting sensitive data
- Integrating third-party APIs

## Topics

| File | Coverage |
|------|----------|
| [secrets-and-input.md](secrets-and-input.md) | Secrets management, input validation, SQL injection prevention |
| [auth-and-xss.md](auth-and-xss.md) | Authentication/authorization, XSS prevention, CSRF protection |
| [rate-limiting-and-data.md](rate-limiting-and-data.md) | Rate limiting, sensitive data exposure, dependency security |
| [blockchain-and-testing.md](blockchain-and-testing.md) | Blockchain/Solana security, security testing, pre-deployment checklist |
| [cloud-infrastructure-security.md](cloud-infrastructure-security.md) | Cloud / infrastructure security patterns |

## Quick Reference — Pre-Deployment Checklist

- [ ] No hardcoded secrets, all in env vars
- [ ] All user inputs validated with schemas
- [ ] All queries parameterized (no SQL concatenation)
- [ ] User HTML sanitized, CSP headers set
- [ ] CSRF tokens on state-changing operations
- [ ] Rate limiting on all endpoints
- [ ] No sensitive data in logs or error messages
- [ ] Dependencies up to date,  clean
- [ ] HTTPS enforced, security headers configured
- [ ] Row Level Security enabled (Supabase)

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/security)
- [Supabase Security](https://supabase.com/docs/guides/auth)
- [Web Security Academy](https://portswigger.net/web-security)

---

**Remember**: Security is not optional. One vulnerability can compromise the entire platform. When in doubt, err on the side of caution.
