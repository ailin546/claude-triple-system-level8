# Instinct Format

## YAML Schema

An instinct is a small learned behavior stored as a YAML file with a frontmatter header and markdown body:

```
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
- User corrected class-based approach to functional on 2025-01-15
```

## Properties

- **Atomic** - one trigger, one action
- **Confidence-weighted** - 0.3 = tentative, 0.9 = near certain
- **Domain-tagged** - code-style, testing, git, debugging, workflow, etc.
- **Evidence-backed** - tracks what observations created it
- **Scope-aware** - `project` (default) or `global`

## Confidence Scoring

| Score | Meaning | Behavior |
|-------|---------|----------|
| 0.3 | Tentative | Suggested but not enforced |
| 0.5 | Moderate | Applied when relevant |
| 0.7 | Strong | Auto-approved for application |
| 0.9 | Near-certain | Core behavior |

**Confidence increases** when: pattern is repeatedly observed, user does not correct the behavior, similar instincts from other sources agree.

**Confidence decreases** when: user explicitly corrects the behavior, pattern is not observed for extended periods, contradicting evidence appears.

## Scope Decision Guide

| Pattern Type | Scope | Examples |
|-------------|-------|---------|
| Language/framework conventions | project | "Use React hooks", "Follow Django REST patterns" |
| File structure preferences | project | "Tests in __tests__/", "Components in src/components/" |
| Code style | project | "Use functional style", "Prefer dataclasses" |
| Error handling strategies | project | "Use Result type for errors" |
| Security practices | global | "Validate user input", "Sanitize SQL" |
| General best practices | global | "Write tests first", "Always handle errors" |
| Tool workflow preferences | global | "Grep before Edit", "Read before Write" |
| Git practices | global | "Conventional commits", "Small focused commits" |
