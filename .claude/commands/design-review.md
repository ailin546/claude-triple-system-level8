# Design Review

Post-implementation review of UI changes against design standards and accessibility.
The visual counterpart of `/code-review`.

## Usage

- `/design-review` — Review all uncommitted UI changes
- `/design-review <path>` — Review specific file or directory

## Process

1. Read the skill at `.claude/skills/design-review/SKILL.md`
2. Execute the 7-step workflow defined there:
   - **Step 1**: Identify changed UI files (css, tsx, jsx, vue, svelte, html)
   - **Step 2**: Design token compliance (no hardcoded colors, spacing, fonts)
   - **Step 3**: Accessibility audit (WCAG AA checklist)
   - **Step 4**: Responsive design check (320px to 1920px)
   - **Step 5**: Visual consistency (typography, spacing rhythm, states)
   - **Step 6**: Performance impact (CSS size, heavy filters, images)
   - **Step 7**: Generate report with severity ratings

## Quick Checks

```bash
# Find hardcoded colors
grep -rn '#[0-9a-fA-F]\{3,8\}\b' --include="*.css" --include="*.scss" --include="*.tsx" | grep -v 'var(' | grep -v '//'

# Find hardcoded spacing
grep -rn 'margin\|padding\|gap' --include="*.css" --include="*.scss" | grep -E '[0-9]+px' | grep -v 'var('

# Find missing alt text
grep -rn '<img' --include="*.tsx" --include="*.jsx" --include="*.html" | grep -v 'alt='
```

## Severity Guide

- **CRITICAL**: Accessibility violation, broken layout — must fix
- **HIGH**: Design system violation — should fix before merge
- **MEDIUM**: Minor visual issue — fix if time allows
- **LOW**: Nitpick — informational only

## Verdict

- CRITICAL or HIGH issues found: **NEEDS FIXES** (block merge)
- Only MEDIUM/LOW: **PASS** (informational)
