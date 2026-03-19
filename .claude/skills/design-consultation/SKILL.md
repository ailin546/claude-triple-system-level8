---
description: Multi-perspective design consultation combining UI, UX, brand, and accessibility experts
triggers:
  - before starting UI/UX work
  - when making design decisions
  - when planning new pages, components, or user flows
---

# Design Consultation

Multi-agent design consultation that gathers perspectives from specialized design agents
before implementation begins. Prevents design debt by addressing visual, structural,
accessibility, and brand concerns upfront.

## When to Use

- Starting a new page, feature, or component with UI elements
- Uncertain about layout, color, typography, or interaction patterns
- Need to balance aesthetics with accessibility and performance
- Before major UI refactors or redesigns

## Workflow

### Step 1: Gather Context

Collect information about the design task:

1. **User request** — What is being built or changed?
2. **Existing design tokens** — Check for CSS variables, theme files, design system:
   ```bash
   # Find existing design tokens
   find . -name "*.css" -o -name "*.scss" -o -name "*.less" | head -20
   grep -r "var(--" --include="*.css" -l 2>/dev/null | head -10
   grep -r "design-system\|tokens\|theme" --include="*.{css,json,ts,js}" -l 2>/dev/null | head -10
   ```
3. **Tech stack** — Framework (React/Vue/Svelte/vanilla), CSS approach (Tailwind/modules/BEM)
4. **Target devices** — Mobile-first? Desktop-only? Both?

### Step 2: Dispatch Parallel Design Agents

Launch 3 specialized agents in parallel for independent perspectives:

| Agent | Role | Focus |
|-------|------|-------|
| `design-ui-designer` | Visual Design | Color, typography, spacing, component patterns, dark mode |
| `design-ux-architect` | UX Structure | Layout, information architecture, responsive strategy, interaction flow |
| `design-ux-researcher` | User Perspective | User needs, cognitive load, task completion, usability patterns |

Each agent receives the same context and independently produces recommendations.

### Step 3: Accessibility Gate

Run a mandatory accessibility check on the proposed design:

| Check | Standard | Requirement |
|-------|----------|-------------|
| Color contrast | WCAG AA | 4.5:1 normal text, 3:1 large text |
| Touch targets | WCAG 2.5.5 | 44x44px minimum |
| Keyboard navigation | WCAG 2.1.1 | Full functionality without mouse |
| Focus indicators | WCAG 2.4.7 | Visible focus on all interactive elements |
| Motion | WCAG 2.3.3 | Respect `prefers-reduced-motion` |
| Text scaling | WCAG 1.4.4 | Works at 200% zoom |

### Step 4: Synthesize Recommendations

Merge agent outputs into a unified design brief:

```
## Design Consultation Report

### Task: [description]

### Visual Design (UI Designer)
- Color palette: [recommended colors with contrast ratios]
- Typography: [font stack, scale, weights]
- Spacing: [system recommendation]
- Component patterns: [relevant existing or new components]

### UX Structure (UX Architect)
- Layout: [grid/flexbox approach, responsive strategy]
- Information hierarchy: [content flow, visual weight]
- Interaction patterns: [hover, focus, transitions]
- Theme support: [light/dark/system toggle]

### User Perspective (UX Researcher)
- User needs: [primary tasks, mental model]
- Cognitive load: [complexity concerns]
- Usability patterns: [established patterns to follow]

### Accessibility Requirements
- [specific requirements for this design]

### Design Tokens (new or modified)
```css
/* New/modified tokens for this feature */
--feature-bg: ...;
--feature-text: ...;
--feature-border: ...;
```

### Implementation Priority
1. [highest priority item]
2. [next priority]
3. ...

### Open Questions
- [decisions that need user input]
```

### Step 5: User Decision

Present the synthesized report and wait for user confirmation or adjustments
before proceeding to implementation.

## Integration

- **Before `/tdd`**: Run design consultation to define UI requirements, then write tests
- **Before `/code-review`**: Design decisions are documented and reviewable
- **Feeds into**: `design-review` skill for post-implementation validation
