---
name: flight-search
description: Search for flights using Kiwi.com via browser automation. Use when: (1) searching for one-way or return flights between cities, (2) comparing prices across dates, (3) finding best routing options (direct vs connecting). Handles price sorting, date comparison, and routing analysis. NOT for: hotel/accommodation search (use hotel-search skill), train/bus tickets.
---

# Flight Search

Use Kiwi.com for flight searches via browser automation.

## URL Pattern

```
https://www.kiwi.com/en/search/results/{origin}/{destination}/{date}/no-return?adults=1&sortBy=price
```

- `origin` / `destination`: city name slugs e.g. `prague-czech-republic`, `cluj-napoca-romania`, `vienna-austria`
- `date`: `YYYY-MM-DD`
- Add `&currency=czk` for CZK pricing

## Workflow

1. Open Kiwi.com URL with `browser(action=open, profile=openclaw)`
2. Wait for results to load, then `snapshot(compact=true, depth=4)`
3. If few results, click "Load more" to expand
4. Extract: departure time, arrival time, duration, stops, via city, price, airline
5. Filter by routing preference (avoid geographically backwards connections unless price compelling)
6. Present as comparison table: Via | Depart | Arrive | Duration | Price

## Routing Heuristics

- **Direct** always preferred if price reasonable
- **Geographically sensible** connections (e.g. PRG→Milan→CLJ) ✅
- **Backwards** connections (e.g. PRG→London→CLJ) ❌ unless significantly cheaper
- **Real airline vs budget**: LOT/Lufthansa/Austrian include cabin bag; Ryanair/Wizz charge extra ~€10-15
- **All-in price**: add ~260 Kč (~€10) for cabin bag on Ryanair/Wizz when comparing

## Date Strategy

- Search 2-3 dates around target when flexible
- Cheapest isn't always best — factor in arrival time, layover duration, overnight vs daytime

## Key Kiwi.com Notes

- Results load dynamically — wait for full load before snapshotting
- "Load more" button appears when >5 results available
- Price shown is per person, one-way, no bags unless specified
- Self-transfer = passenger responsible for rebooking if missed connection (risky!)
- `sortBy=price` sorts cheapest first
