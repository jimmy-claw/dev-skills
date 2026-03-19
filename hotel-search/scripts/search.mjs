// Hotel search script for Booking.com
// Copy to crib and run: node search.mjs
// Usage: node search.mjs "Prague" "2026-05-07" "2026-05-10" [order=price|distance]

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
chromium.use(StealthPlugin());

const city = process.argv[2] || "Prague";
const checkin = process.argv[3] || "2026-05-07";
const checkout = process.argv[4] || "2026-05-10";
const order = process.argv[5] || "distance"; // distance = sort by km from center

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  locale: "en-GB",
});
const page = await browser.newPage();

// Hotels (201) + Apartments (204), score 7.0+
const url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=1&no_rooms=1&order=${order}&nflt=ht_id%3D201%3Bht_id%3D204%3Breview_score%3D70`;

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000); // CRITICAL: must wait for JS render

try { await page.click("[data-testid=accept]", { timeout: 2000 }); await page.waitForTimeout(2000); } catch {}

const results = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-testid=property-card]")).slice(0, 10).map(c => ({
    name: c.querySelector("[data-testid=title]")?.textContent?.trim(),
    price: c.querySelector("[data-testid=price-and-discounted-price]")?.textContent?.trim(),
    score: c.querySelector("[data-testid=review-score]")?.textContent?.trim(),
    dist: c.querySelector("[data-testid=distance]")?.textContent?.trim(),
    url: c.querySelector("a[data-testid=title-link]")?.href?.split("?")[0],
  }))
);

await browser.close();
console.log(`\n=== ${city} (${checkin} → ${checkout}, sorted by ${order}) ===`);
results.forEach(r => console.log(`${r.name} | ${r.price} | ${r.score} | ${r.dist}\n  ${r.url}`));
