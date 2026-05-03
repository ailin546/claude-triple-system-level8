---
name: ecc-coding-standards
description: "Use when writing or reviewing TypeScript/JavaScript code — universal style/quality rules (naming, types, errors, immutability) applicable to any React/Node frontend or backend. For React-specific implementation patterns (hooks, state mgmt, perf) use ecc-frontend-patterns; for backend service patterns use ecc-backend-patterns."
---

# Coding Standards & Best Practices

Universal coding standards applicable across TypeScript, JavaScript, React, Node.js, and API design.

## When to Activate

- Starting a new project or module
- Reviewing code for quality and maintainability
- Refactoring existing code to follow conventions
- Enforcing naming, formatting, or structural consistency
- Setting up linting, formatting, or type-checking rules
- Onboarding new contributors to coding conventions

## Core Principles

Four universal principles govern all code in this system:

1. **Readability First** — Clear names, consistent formatting, self-documenting code over comments
2. **KISS** — Simplest solution that works; no over-engineering or premature optimization
3. **DRY** — Extract common logic; create reusable components; share utilities
4. **YAGNI** — Build only what is needed now; add complexity only when required

## Topics Index

| Topic | File | Contents |
|-------|------|----------|
| TypeScript / JavaScript | [ts-js-standards.md](ts-js-standards.md) | Naming, immutability, error handling, async/await, type safety |
| React patterns | [react-patterns.md](react-patterns.md) | Component structure, custom hooks, state management, conditional rendering |
| API design | [api-design.md](api-design.md) | REST conventions, response format, input validation |
| File organization | [file-organization.md](file-organization.md) | Project structure, file naming, comments & JSDoc |
| Performance & Testing | [performance-testing.md](performance-testing.md) | Memoization, lazy loading, DB queries, AAA pattern, test naming |
| Code smell detection | [code-smells.md](code-smells.md) | Long functions, deep nesting, magic numbers |

Load the relevant sub-document(s) for your task rather than this overview.
