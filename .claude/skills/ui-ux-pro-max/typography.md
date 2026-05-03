# Typography & Font Pairings

57 font pairings + individual Google Fonts lookup. Queryable via `--domain typography` and `--domain google-fonts`.

## Quick query

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "elegant luxury" --domain typography
python3 skills/ui-ux-pro-max/scripts/search.py "playful modern" --domain typography
python3 skills/ui-ux-pro-max/scripts/search.py "professional saas" --domain typography
python3 skills/ui-ux-pro-max/scripts/search.py "sans serif variable popular" --domain google-fonts
python3 skills/ui-ux-pro-max/scripts/search.py "japanese monospace" --domain google-fonts
```

## Pairing personalities the database covers

- **Elegant / luxury** — high-contrast serif heading + clean sans body (Playfair + Inter)
- **Playful / modern** — geometric sans (Poppins, DM Sans, Outfit)
- **Editorial / magazine** — bold serif heading + grotesque body
- **Professional / SaaS** — Inter, Manrope, IBM Plex Sans
- **Tech / monospace-flavored** — JetBrains Mono, Space Grotesk + Space Mono
- **Friendly / approachable** — Nunito, Quicksand, Mulish
- **Brutalist / editorial** — bold display + neutral body
- **Soft / wellness** — humanist sans (Work Sans, Source Sans)

## Typography rules (MEDIUM priority)

| Rule | Standard |
|---|---|
| `font-pairing` | Heading + body personalities must complement, not clash |
| `font-scale` | Consistent scale (e.g., 12 / 14 / 16 / 18 / 24 / 32) |
| `text-styles-system` | Use platform type roles — iOS Dynamic Type / Material display/headline/title/body/label |
| `weight-hierarchy` | Bold headings (600–700), Regular body (400), Medium labels (500) |
| `line-height` | 1.5–1.75 for body |
| `line-length` | 65–75 chars desktop; 35–60 mobile |
| `readable-font-size` | Min 16px body on mobile (prevents iOS auto-zoom) |
| `letter-spacing` | Respect platform defaults; don't tighten body text |
| `number-tabular` | Tabular figures for data columns / prices / timers — prevents layout shift |
| `truncation-strategy` | Prefer wrapping; if truncate use ellipsis + tooltip/expand |
| `whitespace-balance` | Whitespace groups related items; separates sections |

## Type scale recommendations

Mobile: 12 / 14 / 16 / 18 / 22 / 28 / 36
Desktop: 12 / 14 / 16 / 18 / 24 / 32 / 48

Use a multiplier (1.125, 1.25, 1.333, 1.5) for systematic generation.

## Dynamic Type / scaling support

- `dynamic-type` — Support system text scaling; avoid fixed-height containers that truncate when text grows
- Test at largest accessibility size before delivery

## Anti-patterns

- Body text < 12px
- More than 2 font families per product (3+ feels chaotic)
- Tight tracking on body text
- Fixed-px container heights that break Dynamic Type
- All-uppercase paragraphs (use only for short labels)

## Google Fonts lookup

`--domain google-fonts` returns individual font metadata: weights, styles, variable axes, language coverage, popularity. Useful for picking fonts that aren't in the curated 57 pairings.
