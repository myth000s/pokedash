# pokedash: design

Date: 2026-10-19 · Status: draft, waiting for the owner's review

## 1. What this is and why

pokedash finds Pokémon TCG products that are listed well below their market value, so a collector can buy what they're missing as cheaply as possible.

The owner is a collector, not a reseller. Today they find deals by hand: they spot a listing, look up the market value, and see it's much cheaper. pokedash does that checking for them across marketplaces and tells them when something is worth a look.

Users: the owner plus up to three friends. The app is private, with no public sign-up.

## 2. Goals, non-goals, anti-goals

**Goals**

- Watch documented marketplace sources for listings of tracked products and score each listing against a trustworthy, sales-based market value.
- For every deal, show the market value, the total price including shipping (where known), the discount in € and %, how much the market value can be trusted, how fresh both prices are, and a direct link to the listing.
- Alert users (email first, phone push later) when a deal appears on something they watch.
- Start with one set (30th Celebration). Adding a set should be a config change.

**Non-goals for now**

- Kleinanzeigen. It has no API, its terms ban scrapers, and users report that its own search-alert emails arrive hours late.
- Japanese, Chinese and Indonesian/Thai products. Only English and German.
- Graded cards.
- Buying through the app.
- Public accounts, payments.

**Anti-goals** (failure even if it technically works)

- Calling something a deal just because it's the cheapest asking price. Market value comes from sales, never from the lowest offer.
- Reseller tooling: profit calculators, bulk buying, flipping features.
- Breaking a marketplace's terms: no scraping, no getting around bot protection.
- Alert spam on bulk cards, or on items whose market value can't be trusted.

## 3. The first set: 30th Celebration

Released 16 September 2026. On Cardmarket, the English/German release is expansion **6601**. These Cardmarket expansions are *not* tracked: 6602 (JP), 6603 (Simplified Chinese), 6604 (Indonesian & Thai), 6628 and 6774 (Asian-market box sets).

As of 2026-10-19, expansion 6601 has 191 singles and 46 non-single products. Tracked sealed categories: Pokémon Booster, Pokémon Display, Pokémon Elite Trainer Boxes, Pokémon Box Set, Pokémon Blisters, Pokémon Theme Decks and Pokémon Tins, 35 products in all. Excluded: Pokémon Coins (7) and PCG Set (4, which are complete sets of singles).

More sealed products are still being released through early December 2026. They show up in Cardmarket's catalogue and get picked up automatically.

## 4. Data sources

| Source | Used for | Access | What to know |
|---|---|---|---|
| Cardmarket price guide + product catalogue | Market value; list of products | Official public download, no key | Updated once a day. Prices aren't split by language or condition. Sealed products only have `avg`, `low`, `trend` (no 1/7/30-day averages). `low` is the cheapest *asking* price across all languages. Card names don't include collector numbers, and different printings can share a name (three "Mew [Psychic \| 30C]" products priced €0.23, €2,264 and €3,160). |
| CardTrader API v2 | Live listings (slice 1) | Personal API token from the CardTrader profile. 200 requests / 10 s overall, 10 / s for marketplace calls | Returns the 25 cheapest offers per card. Each card ("blueprint") lists its Cardmarket product IDs, so listings match exactly. No shipping cost per offer. |
| eBay Browse API (`EBAY_DE`) | Live listings (slice 2) | eBay developer account, 5,000 calls/day | Free-text titles, so matching is needed. Shipping is included. Asking prices only (sold data is restricted). |
| Cardmarket API | Not used | Closed to new users | |
| Kleinanzeigen | Not used | No API; terms § 5 Nr. 1 ban scrapers | |

Download URLs (checked 2026-10-19):

- `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
- `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json`
- `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json`

**Not verified:** CardTrader's official docs block automated readers, so the response shapes here come from a community reference. The Pokémon property names `pokemon_language` and `pokemon_reverse`, and the listing URL format `https://www.cardtrader.com/cards/<blueprint id>`, are assumptions. They must be confirmed with a real token before the slice is called done.

## 5. How a listing is scored

### 5.1 Market value

- Market value = Cardmarket `trend`, which is based on sales. For reverse holo singles it's `trend-holo`.
- The `low` fields are never used. They are asking prices, often in other languages (the ETB's `low` is €89.90 while its trend is €132.95).
- A price of 0 or a missing price means "no data".

Confidence starts at **high** and can only go down:

| Check | Result |
|---|---|
| No trend price | **insufficient**: "No sales-based market price" |
| A cross-check value is missing (singles: `avg7` or `avg30`; sealed: `avg`) | at most **medium**: "Few recent sales" |
| A cross-check value differs from the trend by more than 25% | at most **medium**: "Recent sales vary from the trend" |
| A cross-check value differs from the trend by more than 50% | **low**: "Recent sales differ a lot from the trend" |
| Price data older than 72 hours (3 days) | **low**: "Price data is N days old", so it never produces a deal |

### 5.2 Listing price

Total price = listing price + shipping. If shipping is unknown (always the case for CardTrader), the listing price is used alone and a "Shipping not included" warning is shown. Only EUR prices are scored for now.

### 5.3 What counts as a deal

A listing is a deal only if **all** of these hold. Otherwise it gets the reasons shown in quotes:

1. Market value confidence is high or medium ("Not enough sales data" / "Market value is unreliable").
2. Price is in EUR ("Price is not in EUR").
3. Market value is at least €5 ("Market value under €5").
4. Language is English or German ("Language fr is not on your list" / "Language unknown").
5. Singles only: condition is Mint or Near Mint ("Condition below Near Mint" / "Condition unknown").
6. Total price is at least 20% below market value ("Only 13% below market value (needs 20%)" / "Priced above market value").
7. The listing was seen in the last 3 days ("Listing not seen for N days"). A listing that hasn't been seen for longer may already be sold.

Discounts of 60% or more are still deals, but they get the warning "Unusually cheap: check the listing carefully". These can be fakes, proxies or mismatches.

Defaults (they become per-user settings with watchlists in slice 3): minimum discount 20%, minimum market value €5, maximum price-data age 72 h, maximum listing age 72 h, suspicious discount 60%, languages en/de, deal conditions Mint/Near Mint.

## 6. User experience (MVP)

- **Deal feed** (home page): cards sorted by discount, biggest first. Each card shows the product name, Single/Sealed, marketplace, language, condition, reverse holo, the price and shipping, market value with its confidence, the discount in € and %, when the market value and the listing were last seen, any warnings, and a "View listing" link that opens the marketplace. If there are no deals, the page says so and shows when listings were last checked.
- **Filters and sorting:** sealed/singles, set, product type, language, condition, marketplace, price range. Sort by discount, price or freshness.
- **Product page:** market-value history and the product's current listings.
- **Watchlist and alerts:** each user picks products (or a whole set) and a discount threshold. Email goes out when a new deal matches, with no repeat alert for the same listing at the same price.
- **Admin page:** when each source last ran, whether it succeeded, item counts and errors.

Slice 1 delivers only the deal feed for 30th Celebration.

## 7. Architecture

- **App:** Next.js (App Router), TypeScript, Tailwind CSS. Server components read the database directly, with no public API. UI text is in English, and prices use the `en-IE` euro format (€1,234.56).
- **Database:** PostgreSQL on Supabase. In development it's the local Supabase stack (Supabase CLI + Docker), and the hosted project comes when deploying. Drizzle ORM owns the schema and migrations. Supabase Auth (magic link, email allow-list) arrives with watchlists.
- **Ingestion:** plain TypeScript modules. For now they run from a CLI script, and they'll be scheduled when deployed. Per tracked set, Cardmarket runs first (product list + today's prices), then each listing provider.
- **Provider interface:** `ListingProvider.fetchListings(set, trackedCardmarketIds)` returns normalized listings plus skipped offers with reasons. Matching to a Cardmarket product happens inside the provider, by ID wherever the source offers one. New marketplaces plug in without touching the rest.
- **Deduplication and history:** a listing is unique per (marketplace, external ID) and gets upserted. A price-history row is written when the price or shipping changes. Listings missing from a successful run are marked unavailable. A failed run changes nothing.
- **Validation:** zod schemas at every external boundary. A malformed download fails the run before anything is written.
- **Rate limits and transient failures:** one fetch helper with retry and exponential backoff on network errors, 429 (honouring `Retry-After`) and 5xx. Other 4xx responses fail fast.
- **Secrets:** environment variables only (`DATABASE_URL`, `CARDTRADER_TOKEN`). They're server-only, never logged, never in error messages, never sent to the browser.
- **Scores are computed when the feed is read**, from listings plus each product's latest market value, so a stored score can never go stale. Data volume is small: hundreds of products, a few thousand listings.
- **Tests:** Vitest. Database tests run on in-memory PGlite (real Postgres compiled to WASM) with the real migrations, so they need no Docker. No test touches the network.

## 8. Data model (slice 1)

- `products`: one row per Cardmarket product: Cardmarket ID (unique), name, kind (single/sealed), Cardmarket category name, Cardmarket expansion ID, set key.
- `benchmark_snapshots`: one row per product per price-guide day: the 12 price-guide values in integer cents, plus the price guide's `createdAt`. Unique on (product, captured at).
- `listings`: marketplace, external ID (unique together), product, title, URL, price, currency, shipping (nullable), condition, language, reverse holo, seller name and country, available, first seen, last seen.
- `listing_price_history`: listing, price, shipping, observed at.

All money is stored as integer euro cents.

Added later: `users` (Supabase Auth), `watchlist_items`, `alert_deliveries`, `ingestion_runs`.

## 9. Risks

1. **Data access.** The two sources the owner first named are out (Kleinanzeigen) or only give a daily summary (Cardmarket). The live listings come from CardTrader and eBay, which both need accounts. CardTrader's docs couldn't be read directly. A smoke script must confirm the response shape with a real token.
2. **Card matching.** Cardmarket's catalogue has no collector numbers, and different printings share names. Matching must be by ID, never by name. CardTrader gives Cardmarket IDs. eBay titles are free text, so that matcher is the main open problem for slice 2 (sealed first, singles later).
3. **Market-value reliability.** One daily value, mixed across languages and conditions. Sealed products have no recent-sales averages. Section 5's confidence rules are the defence. They should be tuned once real data is flowing.
4. **Freshness.** CardTrader offers change quickly. A check every ~15 minutes needs a scheduler that the hosting plan allows. This gets decided in the deployment slice.
5. **Shipping.** CardTrader doesn't return shipping per offer, so CardTrader deals always say "Shipping not included".
6. **CardTrader terms.** API access is offered to every user, but the terms for using marketplace data weren't readable. The owner should check them when creating the token.

## 10. Build order

1. **Slice 1:** Cardmarket market values + CardTrader listings → scored deals on the feed page (local only).
2. **Slice 2:** eBay provider (EBAY_DE), sealed-product title matching, shipping.
3. **Slice 3:** sign-in for the 4 users, watchlists, per-user thresholds, email alerts.
4. **Slice 4:** feed filters and sorting, product page with price history.
5. **Slice 5:** admin page, `ingestion_runs`.
6. **Slice 6:** deploy (hosted Supabase + Next.js host), scheduled ingestion, phone push.

Then: more sets.

## 11. Who decided what

**The owner decided:** collector focus and the "not a reseller" stance; 30th Celebration first, more sets later; notifications with email; private for the owner plus up to three friends; respect each site's rules and use only documented sources; Cardmarket for market value, CardTrader and eBay for listings, Kleinanzeigen left out; English and German only; Next.js, TypeScript, Tailwind, PostgreSQL, Supabase; provider interface, background jobs, deduplication, validation, protected credentials, rate-limit handling; TDD and code review; one vertical slice first; the MVP feature list in section 6; a deal needs at least 20% below market value (confirmed 2026-10-19; may be lowered later); market values older than 3 days never produce deals (2026-10-19).

**Claude's calls, to be checked:**

- CardTrader is the first listing source because it gives exact Cardmarket IDs. eBay comes second.
- The other deal thresholds in section 5 (€5 minimum value, 60% suspicious, Mint/Near Mint only).
- Listings not seen for more than 3 days don't count as deals. This extends the owner's 3-day rule from market values to listings.
- The confidence rules in section 5.1.
- An offer whose language is missing is skipped, never assumed to be English.
- Coins and complete-set products are excluded.
- Drizzle ORM. PGlite for tests. Local Supabase in Docker for development.
- Scores are computed when the feed is read, not stored.
- Integer cents for money. `en-IE` euro formatting. English UI text.
- Kleinanzeigen's search-alert emails aren't used.
