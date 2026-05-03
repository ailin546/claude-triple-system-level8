---
name: design-review
description: Use when UI components or styles in your own codebase have just been implemented and need quality audit before PR — validates design tokens, accessibility, responsive behavior, and visual consistency against the project's design system. For critiquing standalone Figma mockups use design:design-critique; for WCAG-only audits use design:accessibility-review.
---

# Design Review

Systematic post-implementation review that validates UI code against design system
standards, accessibility requirements, and visual consistency. The design counterpart
of `/code-review`.

## When to Use

- After implementing any UI component, page, or visual change
- Before creating a PR that includes frontend/visual changes
- When refactoring CSS or design token usage
- Periodic audit of design system compliance

## Workflow

### Step 1: Identify Changed UI Files

```bash
# Get files with visual impact
BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "origin/main")
git diff --name-only $BASE...HEAD | grep -E '\.(css|scss|less|tsx|jsx|vue|svelte|html|styl)$'
```

### Step 2: Design Token Compliance

Check that implementations use design tokens instead of hardcoded values:

| Check | Bad | Good |
|-------|-----|------|
| Colors | `color: #3b82f6` | `color: var(--color-primary-500)` |
| Spacing | `margin: 16px` | `margin: var(--space-4)` |
| Font size | `font-size: 14px` | `font-size: var(--font-size-sm)` |
| Shadows | `box-shadow: 0 4px 6px...` | `box-shadow: var(--shadow-md)` |
| Transitions | `transition: 0.3s` | `transition: var(--transition-normal)` |
| Border radius | `border-radius: 8px` | `border-radius: var(--radius-md)` |

Search for violations:

```bash
# Find hardcoded color values (hex, rgb, hsl) in CSS
grep -rn '#[0-9a-fA-F]\{3,8\}\b' --include="*.css" --include="*.scss" --include="*.tsx" | grep -v 'var(' | grep -v '//' | grep -v '\.md'

# Find hardcoded pixel values for spacing
grep -rn 'margin\|padding\|gap' --include="*.css" --include="*.scss" | grep -E '[0-9]+px' | grep -v 'var('

# Find hardcoded font sizes
grep -rn 'font-size' --include="*.css" --include="*.scss" | grep -E '[0-9]+px' | grep -v 'var('
```

### Step 3: Accessibility Audit

Run checks against WCAG AA standards:

**Automated checks:**
```bash
# If axe-core or pa11y available
npx pa11y <url> 2>/dev/null || echo "pa11y not available"
npx axe <url> 2>/dev/null || echo "axe not available"
```

**Manual review checklist:**

| # | Check | Severity | How to Verify |
|---|-------|----------|---------------|
| 1 | Color contrast >= 4.5:1 (normal text) | CRITICAL | Inspect text/background color pairs |
| 2 | Color contrast >= 3:1 (large text, UI) | CRITICAL | Check buttons, icons, borders |
| 3 | Focus indicators visible | CRITICAL | Tab through all interactive elements |
| 4 | `alt` text on images | HIGH | Search for `<img` without `alt` |
| 5 | Semantic HTML (`<nav>`, `<main>`, `<button>`) | HIGH | Check for div-based buttons/links |
| 6 | ARIA labels on icon-only buttons | HIGH | Search for buttons without text |
| 7 | Form labels associated with inputs | HIGH | Check `<label for>` or `aria-label` |
| 8 | Touch targets >= 44x44px | MEDIUM | Check button/link dimensions |
| 9 | `prefers-reduced-motion` respected | MEDIUM | Search for animations without media query |
| 10 | Logical tab order | MEDIUM | Verify tabindex usage |

### Step 4: Responsive Design Check

Verify responsive behavior at standard breakpoints:

```
Mobile:  320px, 375px, 414px
Tablet:  768px, 1024px
Desktop: 1280px, 1440px, 1920px
```

Check for:
- Overflow/horizontal scroll issues
- Text truncation problems
- Hidden content at small viewports
- Touch target sizes on mobile
- Grid/flex layout behavior at breakpoints

### Step 5: Visual Consistency

| Check | What to Look For |
|-------|-----------------|
| Typography hierarchy | Consistent heading sizes, line heights, font weights |
| Spacing rhythm | Consistent use of spacing scale (no arbitrary values) |
| Color usage | Semantic colors used correctly (error=red, success=green) |
| Component patterns | Similar elements styled consistently (all cards, all buttons) |
| Dark mode | All components work in both light and dark themes |
| Loading states | Skeleton screens or spinners for async content |
| Empty states | Meaningful messaging when no data |
| Error states | Clear error display with recovery actions |

### Step 6: Performance Impact

```bash
# Check CSS bundle size impact
git diff --stat $BASE...HEAD -- '*.css' '*.scss'

# Find potentially expensive CSS
grep -rn 'box-shadow\|filter\|backdrop-filter\|will-change' --include="*.css" --include="*.scss" | head -20

# Check for large images added
git diff --name-only $BASE...HEAD | grep -E '\.(png|jpg|jpeg|gif|svg|webp)$'
```

### Step 7: Output Report

```
## Design Review Report

Branch: feature/new-dashboard
Files reviewed: 12 UI files

### Design Token Compliance: 85%
- 3 hardcoded colors found (should use tokens)
- 2 hardcoded spacing values found
- All font sizes use tokens

### Accessibility: 4 issues
[CRITICAL] Missing alt text on hero image (src/components/Hero.tsx:15)
[HIGH] Button has no accessible name (src/components/IconButton.tsx:8)
[MEDIUM] Animation lacks prefers-reduced-motion (src/styles/card.css:42)
[MEDIUM] Touch target too small: 32x32px (src/components/CloseBtn.tsx:5)

### Responsive: PASS
- Tested at 320px, 768px, 1280px breakpoints
- No overflow issues detected

### Visual Consistency: 2 notes
[MEDIUM] Card shadow inconsistent with design system (uses custom shadow)
[LOW] Button border-radius differs from token value

### Performance: OK
- CSS added: +45 lines
- No heavy filters or backdrop-filter
- 1 SVG icon added (2KB)

### Verdict: NEEDS FIXES (1 critical, 1 high)
Fix CRITICAL and HIGH issues before merge.
```

## Severity Guide

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Accessibility violation, broken layout | Must fix before merge |
| HIGH | Design system violation, inconsistency | Should fix before merge |
| MEDIUM | Minor visual issue, optimization | Fix if time allows |
| LOW | Nitpick, preference | Informational only |

## Integration

- **After `/code-review`**: Design review as a companion visual check
- **After `design-consultation`**: Validates implementation matches design decisions
- **Before `/verify`**: Ensures visual quality meets standards
- **Feeds into**: `qa-health-score` for design-related quality metrics
