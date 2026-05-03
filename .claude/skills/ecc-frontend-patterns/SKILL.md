---
name: ecc-frontend-patterns
description: "Use when implementing React or Next.js frontend code — state management, performance optimization, UI implementation patterns (hooks, contexts, virtualization). For general TypeScript/JavaScript style rules use ecc-coding-standards; for visual/design quality use design-review or ui-ux-pro-max."
---

# Frontend Development Patterns

Modern frontend patterns for React, Next.js, and performant user interfaces.

## When to Activate

- Building React components (composition, props, rendering)
- Managing state (useState, useReducer, Zustand, Context)
- Implementing data fetching (SWR, React Query, server components)
- Optimizing performance (memoization, virtualization, code splitting)
- Working with forms (validation, controlled inputs, Zod schemas)
- Handling client-side routing and navigation
- Building accessible, responsive UI patterns

## Topics

| Topic | File | Contents |
|-------|------|----------|
| Component Patterns | [react-patterns.md](react-patterns.md) | Composition, compound components, render props, error boundaries |
| Custom Hooks | [custom-hooks.md](custom-hooks.md) | useToggle, useQuery, useDebounce — reusable hook patterns |
| State Management | [state-management.md](state-management.md) | Context + Reducer pattern |
| Performance | [performance.md](performance.md) | Memoization, code splitting, virtualization |
| Forms & Accessibility | [forms-and-accessibility.md](forms-and-accessibility.md) | Controlled forms, keyboard nav, focus management |
| Animations | [animations.md](animations.md) | Framer Motion list & modal patterns |

> Load individual topic files on demand — only read what the current task needs.
