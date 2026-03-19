// Fetch and analyze reviews for a Booking.com property
// Usage: node fetch-reviews.mjs "https://www.booking.com/hotel/ro/apor-apartments.html"

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
chromium.use(StealthPlugin());

const hotelUrl = process.argv[2];
if (!hotelUrl) { console.error("Usage: node fetch-reviews.mjs <booking.com hotel url>"); process.exit(1); }

// Convert hotel URL to reviews URL
const reviewsUrl = hotelUrl.replace(
  /booking\.com\/hotel\/([a-z]+)\/(.+?)\.html.*/,
  "booking.com/reviews/$1/hotel/$2.en-gb.html"
);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  locale: "en-GB",
});
const page = await browser.newPage();
await page.goto(reviewsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);

// Get all review text
const text = await page.evaluate(() => document.body.innerText);
await browser.close();

// Filter for relevant lines
const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 30 && l.length < 300);
const RED_FLAGS = /noise|noisy|smell|mold|mould|dirty|cockroach|bug|broken|rude|cold|hot|thin wall/i;
const GOOD = /clean|location|central|quiet|comfortable|staff|helpful|spacious|walk/i;

console.log("\n=== RED FLAGS ===");
lines.filter(l => RED_FLAGS.test(l)).slice(0, 5).forEach(l => console.log("⚠️ ", l));

console.log("\n=== POSITIVES ===");
lines.filter(l => GOOD.test(l) && !RED_FLAGS.test(l)).slice(0, 8).forEach(l => console.log("✅ ", l));
