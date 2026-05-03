# UX Guidelines (99 rules)

The 10 categories below cover all 99 UX rules. Query specific rules with `--domain ux <keyword>`.

Priority categories (1 = most critical):

| # | Category | Impact | Domain |
|---|----------|--------|--------|
| 1 | Accessibility | CRITICAL | `ux` |
| 2 | Touch & Interaction | CRITICAL | `ux` |
| 3 | Performance | HIGH | `ux` |
| 4 | Style Selection | HIGH | `style`, `product` |
| 5 | Layout & Responsive | HIGH | `ux` |
| 6 | Typography & Color | MEDIUM | `typography`, `color` |
| 7 | Animation | MEDIUM | `ux` |
| 8 | Forms & Feedback | MEDIUM | `ux` |
| 9 | Navigation Patterns | HIGH | `ux` |
| 10 | Charts & Data | LOW | `chart` (see `charts.md`) |

## 1. Accessibility (CRITICAL)

Key rules: `color-contrast` (4.5:1 normal, 3:1 large), `focus-states` (2–4px rings), `alt-text`, `aria-labels`, `keyboard-nav`, `form-labels`, `skip-links`, `heading-hierarchy`, `color-not-only`, `dynamic-type`, `reduced-motion`, `voiceover-sr`, `escape-routes`, `keyboard-shortcuts`.

Anti-patterns: removing focus rings, icon-only buttons without labels, text reliant on color alone.

## 2. Touch & Interaction (CRITICAL)

`touch-target-size` (44×44pt iOS / 48×48dp Android), `touch-spacing` (8px+ gap), `hover-vs-tap` (don't rely on hover), `loading-buttons` (disable + spinner during async), `error-feedback` (near problem), `cursor-pointer` (web), `gesture-conflicts`, `tap-delay` (`touch-action: manipulation`), `standard-gestures`, `system-gestures` (don't block back-swipe / Control Center), `press-feedback`, `haptic-feedback`, `gesture-alternative`, `safe-area-awareness`, `no-precision-required`, `swipe-clarity`, `drag-threshold`.

Anti-patterns: hover-only interactions, instant 0ms state changes, tiny tap targets.

## 3. Performance (HIGH)

`image-optimization` (WebP/AVIF + srcset + lazy), `image-dimension` (width/height or aspect-ratio for CLS), `font-loading` (`font-display: swap`), `font-preload` (only critical), `critical-css`, `lazy-loading` (route splitting), `bundle-splitting`, `third-party-scripts` (async/defer), `reduce-reflows`, `content-jumping`, `lazy-load-below-fold`, `virtualize-lists` (50+ items), `main-thread-budget` (16ms/frame), `progressive-loading` (skeleton > spinner for >1s), `input-latency` (<100ms), `tap-feedback-speed` (<100ms), `debounce-throttle`, `offline-support`, `network-fallback`.

Anti-patterns: layout thrashing, CLS > 0.1, blocking spinners on long ops.

## 5. Layout & Responsive (HIGH)

`viewport-meta` (never disable zoom), `mobile-first`, `breakpoint-consistency` (375 / 768 / 1024 / 1440), `readable-font-size` (16px body min), `line-length-control`, `horizontal-scroll` (none on mobile), `spacing-scale` (4/8pt rhythm), `touch-density`, `container-width` (max-w-6xl/7xl), `z-index-management`, `fixed-element-offset`, `scroll-behavior` (avoid nested scroll), `viewport-units` (`min-h-dvh` over `100vh`), `orientation-support`, `content-priority`, `visual-hierarchy` (size/spacing/contrast over color).

## 7. Animation (MEDIUM)

`duration-timing` (150–300ms micro / ≤400ms complex / avoid >500ms), `transform-performance` (only transform/opacity), `loading-states` (skeleton if >300ms), `excessive-motion` (1–2 elements/view), `easing` (ease-out enter / ease-in exit), `motion-meaning` (cause-effect, not decoration), `state-transition`, `continuity` (shared element / directional), `parallax-subtle`, `spring-physics`, `exit-faster-than-enter` (60–70% of enter), `stagger-sequence` (30–50ms/item), `shared-element-transition`, `interruptible`, `no-blocking-animation`, `fade-crossfade`, `scale-feedback` (0.95–1.05 on press), `gesture-feedback`, `hierarchy-motion`, `motion-consistency`, `opacity-threshold`, `modal-motion` (animate from trigger), `navigation-direction` (forward L/up, back R/down), `layout-shift-avoid`.

## 8. Forms & Feedback (MEDIUM)

`input-labels` (visible, not placeholder-only), `error-placement` (below field), `submit-feedback`, `required-indicators`, `empty-states`, `toast-dismiss` (3–5s), `confirmation-dialogs` (destructive only), `input-helper-text`, `disabled-states` (opacity 0.38–0.5 + cursor + semantic attr), `progressive-disclosure`, `inline-validation` (on blur, not keystroke), `input-type-keyboard` (semantic types trigger right keyboard), `password-toggle`, `autofill-support`, `undo-support`, `success-feedback`, `error-recovery` (cause + how to fix), `multi-step-progress`, `form-autosave`, `sheet-dismiss-confirm`, `error-clarity`, `field-grouping`, `read-only-distinction`, `focus-management` (auto-focus first invalid), `error-summary`, `touch-friendly-input` (≥44px), `destructive-emphasis` (red, separated), `toast-accessibility` (`aria-live="polite"`), `aria-live-errors`, `contrast-feedback`, `timeout-feedback`.

## 9. Navigation Patterns (HIGH)

`bottom-nav-limit` (≤5), `drawer-usage` (secondary), `back-behavior` (predictable, preserve scroll), `deep-linking` (every key screen), `tab-bar-ios`, `top-app-bar-android`, `nav-label-icon` (both, not icon-only), `nav-state-active` (highlight current), `nav-hierarchy` (primary vs secondary clear), `modal-escape`, `search-accessible`, `breadcrumb-web` (3+ levels), `state-preservation` (scroll/filter/input on back), `gesture-nav-support`, `tab-badge` (sparingly, clear after visit), `overflow-menu`, `bottom-nav-top-level` (never nest sub-nav inside), `adaptive-navigation` (≥1024px → sidebar), `back-stack-integrity`, `navigation-consistency`, `avoid-mixed-patterns` (don't mix Tab + Sidebar + Bottom at same level), `modal-vs-navigation` (modals not for primary nav), `focus-on-route-change` (move focus to main content), `persistent-nav`, `destructive-nav-separation` (logout/delete separated), `empty-nav-state` (explain why unavailable).

## Lookup specific rules

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux
python3 skills/ui-ux-pro-max/scripts/search.py "form validation error" --domain ux
python3 skills/ui-ux-pro-max/scripts/search.py "navigation back stack" --domain ux
```
