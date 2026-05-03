# Common Rules + Pre-Delivery Checklist

App UI focus (iOS / Android / React Native / Flutter). For desktop-web nuances, layer on `ux-guidelines.md`.

## Common Rules for Professional UI

### Icons & Visual Elements

| Rule | Standard | Avoid |
|---|---|---|
| **No Emoji as Icons** | Vector icons (Lucide, react-native-vector-icons) | Emojis for nav/settings/system controls |
| **Vector-Only Assets** | SVG / platform vector icons | Raster PNG that blurs/pixelates |
| **Stable Interaction States** | Color/opacity/elevation transitions | Transforms shifting surrounding content |
| **Correct Brand Logos** | Official assets + guidelines (spacing, color, clear space) | Guessing paths, recoloring, distorting |
| **Consistent Icon Sizing** | Tokens: `icon-sm`, `icon-md=24pt`, `icon-lg` | Random 20/24/28pt mix |
| **Stroke Consistency** | One stroke width per layer (1.5px or 2px) | Mixing widths arbitrarily |
| **Filled vs Outline** | One style per hierarchy level | Mixing at same level |
| **Touch Target Min** | ≥ 44×44pt area; `hitSlop` for small icons | Small icons without expanded tap area |
| **Icon Alignment** | Align to text baseline; consistent padding | Misalignment, uneven spacing |
| **Icon Contrast** | WCAG: 4.5:1 small / 3:1 large UI glyphs | Low-contrast icons blending into bg |

### Interaction (App)

| Rule | Do | Don't |
|---|---|---|
| **Tap feedback** | Pressed feedback (ripple/opacity/elevation) within 80–150ms | No visual response on tap |
| **Animation timing** | 150–300ms with platform-native easing | Instant or >500ms |
| **A11y focus order** | Screen-reader order matches visual; descriptive labels | Unlabeled controls; confusing order |
| **Disabled clarity** | `disabled` semantics + reduced emphasis + no tap | Looks tappable but does nothing |
| **Touch target min** | ≥ 44×44pt iOS / 48×48dp Android; expand for small icons | Tiny tap targets |
| **Gesture conflicts** | One primary gesture per region | Nested tap/drag overlaps |
| **Semantic native controls** | `Button`, `Pressable` with proper roles | Generic containers as primary controls |

### Light/Dark Mode Contrast

| Rule | Do | Don't |
|---|---|---|
| **Surface readability (light)** | Cards separated via opacity/elevation | Overly transparent surfaces |
| **Text contrast (light)** | Body ≥ 4.5:1 | Low-contrast gray body |
| **Text contrast (dark)** | Primary ≥ 4.5:1, secondary ≥ 3:1 | Text blending into bg |
| **Border/divider visibility** | Visible in BOTH themes | Disappearing in one mode |
| **State contrast parity** | Pressed/focused/disabled distinguishable in both | States only for one theme |
| **Token-driven theming** | Semantic tokens mapped per theme | Hardcoded per-screen hex |
| **Scrim/modal legibility** | Scrim 40–60% black to isolate foreground | Weak scrim leaving bg competing |

### Layout & Spacing

| Rule | Do | Don't |
|---|---|---|
| **Safe-area compliance** | Respect top/bottom safe areas for fixed bars | Fixed UI under notch/status/gesture area |
| **System bar clearance** | Spacing for status/nav bar + gesture indicator | Tappable content colliding with OS chrome |
| **Consistent content width** | Predictable per device class | Arbitrary widths per screen |
| **8dp spacing rhythm** | 4/8dp system | Random increments |
| **Readable text measure** | Avoid edge-to-edge paragraphs on tablets | Full-width long text |
| **Section spacing hierarchy** | Tiers (16/24/32/48 by hierarchy) | Inconsistent spacing for same hierarchy |
| **Adaptive gutters** | Larger on wider/landscape | Same narrow gutter at all sizes |
| **Scroll/fixed coexistence** | Bottom/top insets so lists clear sticky bars | Content obscured by sticky bars |

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis as icons (SVG only)
- [ ] Icons from one consistent family + style
- [ ] Official brand assets, correct proportions + clear space
- [ ] Pressed-state visuals don't shift layout / cause jitter
- [ ] Semantic theme tokens used (no hardcoded colors)

### Interaction
- [ ] Tap feedback on all tappable elements
- [ ] Touch targets ≥ 44×44pt iOS / 48×48dp Android
- [ ] Micro-interactions 150–300ms, native easing
- [ ] Disabled states visually clear + non-interactive
- [ ] Screen-reader focus order matches visual; labels descriptive
- [ ] No gesture conflicts (tap/drag/back-swipe)

### Light/Dark Mode
- [ ] Primary text ≥ 4.5:1 in both modes
- [ ] Secondary text ≥ 3:1 in both modes
- [ ] Dividers/borders + interaction states visible in both
- [ ] Modal/drawer scrim ≥ 40–60% black
- [ ] BOTH themes tested (not inferred from one)

### Layout
- [ ] Safe areas respected for headers/tab bars/CTA bars
- [ ] Scroll content not hidden behind fixed/sticky bars
- [ ] Verified on small phone, large phone, tablet (portrait + landscape)
- [ ] Horizontal insets adapt by device size + orientation
- [ ] 4/8dp rhythm at component / section / page level
- [ ] Long text readable on larger devices

### Accessibility
- [ ] All meaningful images/icons have a11y labels
- [ ] Form fields have labels + hints + clear errors
- [ ] Color is not the only indicator
- [ ] Reduced motion + Dynamic Type largest size supported
- [ ] A11y traits/roles/states (selected, disabled, expanded) announced

## Common Sticking Points → Where to Look

| Problem | Fix path |
|---|---|
| Can't decide style/color | Re-run `--design-system` with different keywords |
| Dark mode contrast issues | `color-palettes.md` → dark-mode pairing |
| Animations feel unnatural | `ux-guidelines.md` §7 — `spring-physics` + `easing` + `exit-faster-than-enter` |
| Form UX poor | `ux-guidelines.md` §8 — `inline-validation` + `error-clarity` + `focus-management` |
| Navigation confusing | `ux-guidelines.md` §9 — `nav-hierarchy` + `bottom-nav-limit` + `back-behavior` |
| Layout breaks on small screens | `ux-guidelines.md` §5 — `mobile-first` + `breakpoint-consistency` |
| Performance / jank | `ux-guidelines.md` §3 — `virtualize-lists` + `main-thread-budget` + `debounce-throttle` |
