---
name: hotel-search
description: "Search for hotels and apartments on Booking.com using a stealth browser on crib (192.168.0.152). Use when: (1) searching for accommodation in a city for given dates, (2) filtering by distance from a landmark/venue, (3) pulling real reviews to check for red flags (noise, smell, mold, bad beds), (4) comparing options by price/score. NOT for Airbnb (bot-protected). Requires stealth-browser on jimmy@192.168.0.152."
---

# Hotel Search

Uses stealth Playwright browser on crib to scrape Booking.com. Key lesson: **must waitForTimeout(4000+) after domcontentloaded** for results to render.

## Quick Start

```bash
ssh jimmy@192.168.0.152 "cd ~/stealth-browser && node /tmp/hotel-search.mjs" 2>/dev/null
```

Copy the search script to crib, run it, parse output.

## Search Script Pattern

See `scripts/search.mjs` — copy to crib via heredoc and run.

**Key URL parameters:**
- `order=price` — sort by price
- `order=distance` — sort by distance from city center (shows "X m from downtown") ✅ best for venue proximity
- `nflt=ht_id%3D201` — hotels only
- `nflt=ht_id%3D204` — apartments only
- `nflt=review_score%3D80` — score 8.0+
- `nflt=review_score%3D70` — score 7.0+
- `nflt=distance%3D1000` — within 1km of search point (only works for airports/train stations, not street addresses)

**What works for distance filtering:**
- ✅ Airports (e.g. "Henri Coanda Airport Bucharest") — shows exact km distances
- ✅ `order=distance` + city name — sorts by distance from center, shows "X m from downtown"
- ❌ Street addresses — distance filter ignored
- ❌ Piața/squares — not in Booking.com landmark DB

## Review Scraping

Use the reviews page URL pattern:
```
https://www.booking.com/reviews/COUNTRY_CODE/hotel/HOTEL_SLUG.en-gb.html
```

Fetch with `scripts/fetch-reviews.mjs` and grep for keywords:
- Red flags: `noise|smell|mold|mould|dirty|cockroach|bed bug|broken`
- Positives: `clean|location|staff|comfortable|quiet|central`

## Workflow

1. **Search** — run `scripts/search.mjs` with city + dates + filters
2. **Filter** — drop hostels (name contains "hostel"), score < 7.0, far from venue
3. **Get addresses** — use `order=distance` to get "X m from downtown" data
4. **Pull reviews** — for top 2-3 candidates, fetch reviews page and grep
5. **Recommend** — rank by: proximity to venue → score → price → review quality

## Limitations

- Booking.com hides exact street addresses until logged in
- Airbnb is bot-protected, doesn't work
- `distance` URL filter only works for airports/train stations
- Always use `order=distance` when proximity matters — it's the only reliable distance data
