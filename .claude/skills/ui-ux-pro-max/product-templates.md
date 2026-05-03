# Product Templates

161 product types, each mapped to recommended pattern, style, palette family, typography family, and key UX considerations. Queryable via `--domain product`.

## Quick query

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<product type>" --domain product
```

Examples:
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "saas dashboard" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "ecommerce fashion" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "healthcare patient portal" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa booking" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "entertainment social video" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "fintech investment" --domain product
```

## Coverage areas (representative)

- **SaaS** — admin, dashboard, analytics, CRM, project mgmt, helpdesk, billing
- **E-commerce** — fashion, electronics, marketplace, grocery, food delivery
- **Productivity** — task manager, notes, calendar, knowledge base, docs
- **Entertainment** — social feed, video, music, podcast, gaming, streaming
- **Tool / utility** — scanner, editor, converter, calculator, AI assistant
- **Healthcare** — patient portal, telemedicine, wellness, fitness, mental health
- **Beauty / personal care** — spa, salon, skincare, cosmetics
- **Fintech** — banking, payments, investment, crypto, budgeting, lending
- **Education** — LMS, course platform, tutoring, language learning
- **Service / hospitality** — booking, restaurant, hotel, travel, real estate
- **Portfolio / personal** — designer portfolio, agency, freelancer, blog
- **Landing pages** — startup, SaaS marketing, product launch, event, app store
- **Admin panels** — CMS, dashboards, internal tools, monitoring

## What `--domain product` returns

For each product type:
- Pattern recommendation (information density, primary navigation type, hero strategy)
- Compatible style families
- Compatible color palette categories
- Compatible typography families
- Key UX considerations (e.g., "must support filtering at scale" for marketplaces)
- Anti-patterns specific to that product type

## How it integrates with `--design-system`

`--design-system` runs `product` search first, then uses the returned product profile to filter compatible styles/colors/typography. This is why `--design-system` recommendations are coherent — they all match the product type.

## Reasoning rules

`data/ui-reasoning.csv` encodes which combinations score well:
- "fintech + dark mode + neon accent" → high
- "healthcare + brutalism" → low
- "entertainment + minimal monochrome" → context-dependent

You can override by passing explicit style keywords to bypass the recommendation.
