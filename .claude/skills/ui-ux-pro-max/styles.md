# Styles & Visual Design

51 classic styles + 11 modern styles, queryable via `--domain style`.

## Style Selection Rules (HIGH priority)

| Rule | What it means |
|---|---|
| `style-match` | Match style to product type (`--design-system` recommends) |
| `consistency` | Use the same style across all pages |
| `no-emoji-icons` | Use SVG (Heroicons, Lucide); no emojis as structural icons |
| `color-palette-from-product` | Pick palette by product/industry (`--domain color`) |
| `effects-match-style` | Shadows / blur / radius aligned with chosen style (glass / flat / clay) |
| `platform-adaptive` | Respect iOS HIG vs Material idioms |
| `state-clarity` | hover/pressed/disabled visually distinct, on-style |
| `elevation-consistent` | One elevation/shadow scale for cards/sheets/modals |
| `dark-mode-pairing` | Design light + dark together — keep brand/contrast/style consistent |
| `icon-style-consistent` | One icon set, one stroke width, one corner radius |
| `system-controls` | Prefer native/system controls; customize only when branding requires |
| `blur-purpose` | Blur signals dismissable background (modals/sheets), not decoration |
| `primary-action` | One primary CTA per screen; secondaries visually subordinate |

## Style Categories (representative)

**Classic (51)** — flat, material, skeuomorphic, minimal, brutalism, neumorphism, glassmorphism, claymorphism, neobrutalism, dark mode, light mode, monochrome, retro, vintage, swiss, editorial, magazine, cyberpunk, vaporwave, memphis, art deco, scandinavian, japanese minimal, organic, geometric, bauhaus, swiss grid, ...

**Modern (11)** — Y2K revival, AI-native, soft 3D, kinetic typography, bento grids, glass + grain, motion-first, isometric illustration, micro-interactions-rich, sustainable/eco, calm tech.

Query specific styles:
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "glassmorphism dark" --domain style
python3 skills/ui-ux-pro-max/scripts/search.py "brutalism editorial" --domain style
```

## Anti-patterns to avoid

- Mixing flat + skeuomorphic randomly without intent
- Emoji as structural / navigational icons
- Inconsistent stroke widths within the same visual layer
- Mixing filled + outline icons at the same hierarchy level
- Random shadow values instead of a consistent elevation scale
- Inverting light-mode colors for dark mode (use desaturated tonal variants)

## Effects discipline

- **Shadow scale**: define 3–5 elevation tiers max; don't ad-hoc
- **Blur**: only for dismissable backgrounds (modals, sheets, navigation overlays)
- **Radius**: pick a scale (e.g., 4 / 8 / 12 / 16 / 24) and stick to it
- **Glass / clay / neumorph**: pick *one* and commit; mixing destroys cohesion

## When in doubt

Re-run `--design-system` with different keywords; the reasoning engine in `data/ui-reasoning.csv` will surface different style candidates based on product + tone + density.
