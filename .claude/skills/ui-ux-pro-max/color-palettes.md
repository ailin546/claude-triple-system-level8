# Color Palettes

161 palettes indexed by product type / industry / mood. Queryable via `--domain color`.

## Quick query

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<industry> <mood>" --domain color
```

Examples:
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "fintech crypto trustworthy" --domain color
python3 skills/ui-ux-pro-max/scripts/search.py "entertainment vibrant" --domain color
python3 skills/ui-ux-pro-max/scripts/search.py "healthcare calm" --domain color
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa pastel" --domain color
```

## Categories the database covers

- **SaaS** — neutral, professional, accent-driven (blue/purple)
- **E-commerce** — high-contrast CTA, brand-forward
- **Healthcare / wellness** — calm, low-saturation, soft greens/blues
- **Beauty / spa** — pastels, warm neutrals, gold accents
- **Fintech / crypto** — trustworthy navy/blue OR neon dark mode
- **Entertainment / social** — vibrant, gradient-heavy, dark base
- **Productivity** — neutral with single accent
- **Education** — friendly, warm, accessible contrast
- **Service / hospitality** — earthy, premium feel
- **Tool / utility** — minimal, monochrome, single-accent

## Color rules (MEDIUM priority)

| Rule | Standard |
|---|---|
| `color-semantic` | Define semantic tokens (primary, secondary, error, surface, on-surface). No raw hex in components |
| `color-dark-mode` | Dark mode = desaturated/lighter tonal variants, NOT inverted colors |
| `color-accessible-pairs` | FG/BG pairs ≥ 4.5:1 (AA) or 7:1 (AAA). Verify with tools |
| `color-not-decorative-only` | Functional color (error red, success green) MUST include icon/text |
| `contrast-readability` | Darker text on light bg (e.g., slate-900 on white) |
| `contrast-data` | Data lines/bars vs background ≥ 3:1; data labels ≥ 4.5:1 |

## Dark mode pairing

- Test contrast independently — don't assume light-mode values transpose
- Surface elevation in dark mode uses lighter tints, not heavier shadows
- Brand color often needs desaturation (-20–30% chroma) to feel right in dark
- Body text on dark surfaces ≥ 4.5:1; secondary ≥ 3:1
- Borders/dividers must remain visible in BOTH themes

## Anti-patterns

- Gray-on-gray body text (fails contrast)
- Raw hex values in components instead of tokens
- Color-only meaning (e.g., red = error with no icon/text)
- Pure inverted dark mode (`#fff` becomes `#000`) — destroys hierarchy
- Red/green as the only differentiator (colorblind users excluded)

## Persisted output

`--design-system --persist` writes the chosen palette into `design-system/MASTER.md` as semantic tokens (primary, secondary, surface, on-surface, error, success, etc.) ready to drop into Tailwind config or a theme file.
