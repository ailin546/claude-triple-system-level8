# Charts & Data Visualization

25 chart types across 10 technology stacks. Queryable via `--domain chart`.

## Quick query

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "trend timeseries" --domain chart
python3 skills/ui-ux-pro-max/scripts/search.py "comparison categorical" --domain chart
python3 skills/ui-ux-pro-max/scripts/search.py "real-time dashboard" --domain chart
python3 skills/ui-ux-pro-max/scripts/search.py "funnel conversion" --domain chart
```

## Chart type → data type mapping

| Data shape | Chart |
|---|---|
| Trend over time | Line, area |
| Categorical comparison | Bar (vertical/horizontal) |
| Proportion of whole (≤5 categories) | Pie / donut |
| Proportion (>5 categories) | Bar (clearer than pie) |
| Distribution | Histogram, box plot |
| Correlation | Scatter, bubble |
| Hierarchy | Treemap, sunburst |
| Flow / process | Sankey, funnel |
| Geographic | Choropleth, heatmap |
| Multivariate | Radar, parallel coordinates |
| Single value | Gauge, KPI card, sparkline |

## Stacks covered

React/Next, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn (chart components), Web (vanilla / D3), and platform-native chart libs. Each stack entry includes recommended library (recharts, victory, nivo, chart.js, swift-charts, fl_chart, etc.) and example patterns.

## Chart UX rules (LOW priority but high impact)

| Rule | Standard |
|---|---|
| `chart-type` | Match chart to data type (don't pick by aesthetics) |
| `color-guidance` | Accessible palettes; avoid red/green-only pairs |
| `data-table` | Provide table alternative — charts alone aren't screen-reader friendly |
| `pattern-texture` | Supplement color with patterns/textures/shapes |
| `legend-visible` | Show legend near chart; don't hide below scroll fold |
| `tooltip-on-interact` | Tooltips on hover (web) / tap (mobile) — show exact values |
| `axis-labels` | Label with units; readable scale; avoid truncated/rotated on mobile |
| `responsive-chart` | Reflow/simplify on small screens (vertical → horizontal bar; fewer ticks) |
| `empty-data-state` | "No data yet" + guidance; not a blank chart |
| `loading-chart` | Skeleton / shimmer; not an empty axis frame |
| `animation-optional` | Respect `prefers-reduced-motion`; data must be readable immediately |
| `large-dataset` | Aggregate or sample for 1000+ points; provide drill-down |
| `number-formatting` | Locale-aware on axes/labels |
| `touch-target-chart` | Interactive elements ≥ 44pt tap area or expand on touch |
| `no-pie-overuse` | No pie/donut for >5 categories |
| `contrast-data` | Lines/bars vs bg ≥ 3:1; data labels ≥ 4.5:1 |
| `legend-interactive` | Click legend to toggle series |
| `direct-labeling` | Small datasets — label directly to reduce eye travel |
| `tooltip-keyboard` | Tooltip content keyboard-reachable |
| `sortable-table` | Tables sortable with `aria-sort` state |
| `axis-readability` | No cramped ticks; auto-skip on small screens |
| `data-density` | Limit per chart; split if cognitive overload |
| `trend-emphasis` | Data over decoration; avoid heavy gradients/shadows |
| `gridline-subtle` | Low-contrast (e.g., gray-200) so they don't compete with data |
| `focusable-elements` | Interactive elements keyboard-navigable |
| `screen-reader-summary` | Text summary or `aria-label` describing chart's key insight |
| `error-state-chart` | Error + retry, not broken/empty chart |
| `export-option` | CSV/image export for data-heavy products |
| `drill-down-consistency` | Clear back-path + breadcrumb |
| `time-scale-clarity` | Label time granularity (day/week/month) + allow switching |

## Anti-patterns

- Pie chart with 12 categories
- Red/green-only series (colorblind-hostile)
- Charts that animate during data updates and block reading
- 3D pie/bar charts (hurt accuracy)
- Legends hidden below the fold
- Hover-only tooltips with no keyboard equivalent
