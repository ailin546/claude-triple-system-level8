# Workflow & Scripts

How to query the design knowledge base via `scripts/search.py`.

## Prerequisites

```bash
python3 --version || python --version
```

If missing — macOS: `brew install python3`; Ubuntu: `sudo apt install python3`; Windows: `winget install Python.Python.3.12`.

## Step 1: Analyze Requirements

Extract from user request:
- **Product type** — entertainment / tool / productivity / SaaS / e-commerce / fintech / healthcare / etc.
- **Target audience** — age, context (commute / work / leisure)
- **Style keywords** — playful, vibrant, minimal, dark mode, content-first, immersive
- **Stack** — React Native, React/Next, Vue, Svelte, SwiftUI, Flutter, Tailwind, shadcn

## Step 2: Generate Design System (REQUIRED)

Always start with `--design-system` for full recommendations + reasoning:

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<product> <industry> <keywords>" --design-system [-p "Project Name"]
```

Returns: pattern, style, colors, typography, effects, anti-patterns. Reasoning rules from `data/ui-reasoning.csv` pick best matches.

Example:
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --design-system -p "Serenity Spa"
```

## Step 2b: Persist (Master + Overrides)

Add `--persist` to save for cross-session retrieval:

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

Creates `design-system/MASTER.md` (global SoT) and `design-system/pages/` folder.

Page-specific override:
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

Creates `design-system/pages/dashboard.md` — page rules override Master.

**Retrieval prompt for later sessions:**
> I am building the [Page Name] page. Read `design-system/MASTER.md`. If `design-system/pages/[page-name].md` exists, prioritize its rules. Otherwise use Master exclusively.

## Step 3: Domain Searches (deep-dive)

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Need | Domain |
|---|---|
| Product type patterns | `product` |
| Style options | `style` |
| Color palettes | `color` |
| Font pairings | `typography` |
| Chart recommendations | `chart` |
| UX best practices | `ux` |
| Individual Google Fonts | `google-fonts` |
| Landing structure | `landing` |
| React/Next perf | `react` |
| App interface guidelines | `web` |
| AI prompt / CSS keywords | `prompt` |

## Step 4: Stack Guidelines

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack-name>
```

Stacks: `react-native` (and others depending on data set).

## Output Formats

```bash
# ASCII box (default — terminal)
python3 skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system

# Markdown (docs)
python3 skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

## Query Tips

- **Multi-dimensional keywords** — combine product + industry + tone + density: `"entertainment social vibrant content-dense"` not `"app"`
- Try variants: `"playful neon"` → `"vibrant dark"` → `"content-first minimal"`
- `--design-system` first, then `--domain` to deep-dive uncertain dimensions
- Always add `--stack <stack>` for implementation guidance

## Example Workflow — "Make an AI search homepage"

1. Analyze: tool, C-end, modern/minimal/dark, React Native
2. `python3 .../search.py "AI search tool modern minimal" --design-system -p "AI Search"`
3. `python3 .../search.py "minimalism dark mode" --domain style`
4. `python3 .../search.py "search loading animation" --domain ux`
5. `python3 .../search.py "list performance navigation" --stack react-native`

Then synthesize and implement.
