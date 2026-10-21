# pokedash Singles and Sealed sections: design

Date: 2026-10-20 · Status: draft, waiting for the owner's review
Builds on: `2026-10-19-pokedash-design.md` (slice 1) and `2026-10-19-pokedash-aurora-ui-design.md` (Aurora UI, branch `feat/aurora-ui`). Work happens on branch `feat/next-features`.
Mockups: `docs/superpowers/specs/assets/2026-10-20-sections-tabs-mockup.html` (the approved layout, option A) and `…-sections-layout-mockup.html` (the A/B comparison). The class names in them are throwaway.

## 1. Why

The deal feed shows only about 5 deals. The owner wants more data on the page, organised by product type:
- Single cards
- Slabs (graded cards)
- Sealed products: boosters, booster bundles, displays, ETBs, UPCs and the like

For every product, they want to see its cheapest current offer next to its market value, with the real deals highlighted. Everything stays English and German only (the owner's rule from the start).

While checking the data we found two reasons for so few deals:
1. English/German offers get crowded out. CardTrader sends only the 25 cheapest offers per product across all languages, so on popular products (e.g. the ETB) the English and German offers never arrive.
2. The market value mixes all languages. Cardmarket's market value covers every language, so English copies usually look 20 to 50% "too expensive".

## 2. Goals, non-goals, anti-goals

Goals:
- Tabs on the dashboard: Deals · Singles · Sealed · Slabs. Deals is today's view (hero plus tiles). Singles and Sealed are new tables. Slabs is a greyed-out "soon" tab.
- Every Singles/Sealed row shows the product's picture, its Cardmarket market value, a US English-only reference price (converted to €), the cheapest English/German offer, the difference to the market value, and the number of English/German offers. Rows that are real deals glow.
- Fetch CardTrader offers per language (en, de) so English/German offers stop getting crowded out.
- Store only English/German listings from now on.

Non-goals (later steps, in this order):
- Slabs content. It needs eBay listings with structured grades plus PokemonPriceTracker graded prices.
- Automatic updates (scheduler). Ingestion stays manual: `npm run ingest`.
- Logo sketches.
- Free-text search, product detail pages, price-history charts, user accounts and alerts.

Anti-goals:
- Showing any offer that isn't English or German.
- Calling something a deal based on asking prices, or on the US reference. Deals stay judged against Cardmarket only, with the same rules as today.
- Presenting the US price as the market value. It's a small, clearly labelled reference.
- Exceeding the PokemonPriceTracker free tier (100 credits/day), or leaking either API key.
- Matching by name. Products link across sources by ID only.

## 3. Data changes

### 3.1 CardTrader: fetch per language
- Today, for each matching expansion, the provider calls `GET /marketplace/products?expansion_id=X` once. Replace that with two calls, `&language=en` and `&language=de`, and merge the results.
- Verified 2026-10-19: the ETB went from 0 English/German offers to 24 English + 2 German.
- Offers in other languages are no longer fetched. The existing "mark unavailable" sweep retires old non-English/German rows on the next run.
- The 120 ms delay between marketplace calls stays.
- Blueprints are still fetched once per expansion.

### 3.2 Product picture and TCGplayer ID on products
CardTrader blueprints carry `image_url` and `tcg_player_id`. Verified: 232 of 272 blueprints in expansion 4679 have a TCGplayer ID, e.g. the ETB is 704143, which is also PokemonPriceTracker's ID.
- Add `products.image_url` (nullable text, through the existing `safeCardTraderImageUrl` check).
- Add `products.tcgplayer_id` (nullable integer). Set it only when exactly one distinct TCGplayer ID maps to the product across its blueprints; otherwise leave it null.
- Both are filled during listing ingestion from the blueprints. They give every product a picture and a link to the US price, even when it has no offer.

### 3.3 US English-only reference (new source: PokemonPriceTracker)
- API: `https://www.pokemonpricetracker.com/api/v2`, header `Authorization: Bearer <POKEMONPRICETRACKER_API_KEY>` (env only, never logged).
- Cards: `GET /cards?tcgPlayerId=<id>` gives the card. Use `prices.market` (USD, TCGplayer Near Mint). This costs 1 credit.
- Sealed: `GET /sealed-products?tcgPlayerId=<id>` gives `unopenedPrice` (USD). This costs 1 credit.
- Which products: those with a `tcgplayer_id` that are either sealed, or singles with a Cardmarket market value of at least €5. That's about 87 today.
- When: at most once per product per UTC day, skipping products that already have today's price.
- Credit guard: stop early when the response header `X-RateLimit-Daily-Remaining` drops below 10. Stay under 60 requests/minute (about 1.1 s between calls).
- Storage: a new table `us_reference_prices` (`product_id`, `captured_at`, `usd_cents`). History is kept, and unique on (`product_id`, UTC day).
- Runs as its own step in `npm run ingest`. A failure is recorded, and the other sources still run (like today's provider isolation).

### 3.4 Exchange rate (new source: ECB)
- `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` returns the daily reference rate, for example `currency='USD' rate='1.1225'` (1 € = $1.1225, checked 2026-10-19). It's free and official.
- Store it in a new table `fx_rates` (`rate_date`, `usd_per_eur`).
- Fetch it once per run; it's skipped if today's rate is already stored. A failure is recorded, and the last stored rate is used.
- Conversion: € cents = round(usd_cents / usd_per_eur).

## 4. Section tables

### 4.1 What a row contains
Rows are scoped to the tracked set (`TRACKED_SETS[0]`).

| Column | Content |
|---|---|
| Picture | `products.image_url` (5:7, `CardImage` with its placeholder) |
| Name | Title + detail (`splitProductName`). Sealed rows show the section type under the name. |
| Market value | Cardmarket value from the latest snapshot (`assessBenchmark`, same rules as the feed). Shows "–" when insufficient. |
| US English-only | `€9.18 ($10.30)`: the latest US price converted at the latest rate. Shows "–" when there's none. |
| Cheapest EN/DE | The cheapest **available** English/German EUR offer: Near Mint or Mint for singles, any for sealed. Shows the price plus "EN · PT" (language · seller country), or "no EN/DE offer yet". |
| Difference | (offer − market value) / market value: green pill when below, red when above. Shows "–" without both values. |
| Offers | Count of available English/German offers for the product |

- Deal glow: a row glows when its cheapest offer is a deal under the existing rules (`scoreListing` + `markStaleListing`).
- Click: a row with an offer opens that offer's URL in a new tab.

### 4.2 Singles tab
- Default filter: cards with a market value of at least €5 (52 today), plus a switch to show all singles (191).
- Sort: market value, highest first.

### 4.3 Sealed tab
- Sections: all tracked sealed products (35 today).
- Type chips (in this order; "All" first). Types map from the Cardmarket category:

  | Chip | Cardmarket category |
  |---|---|
  | Elite Trainer Boxes | `Pokémon Elite Trainer Boxes` |
  | Booster Bundles & Displays | `Pokémon Display` |
  | Boosters | `Pokémon Booster` |
  | Collections & UPCs | `Pokémon Box Set` |
  | Tins | `Pokémon Tins` |
  | Blisters | `Pokémon Blisters` |
  | Battle Decks | `Pokémon Theme Decks` |

  Unknown categories go under "Other".
- Sort: by type (chip order), then by market value, highest first.

### 4.4 Tabs and navigation
- The tabs sit below the stats row. Labels carry counts: "Deals 5", "Singles 52", "Sealed 35", "Slabs · soon".
- State lives in the URL: `?tab=deals|singles|sealed`, plus `&all=1` (singles) or `&type=<chip>` (sealed). Tabs and chips are plain links, rendered on the server (inside the existing Suspense / `connection()` pattern). The default tab is Deals.
- Slabs is shown greyed out and isn't a link.
- The stats row and top bar are unchanged.

## 5. Constraints
- Unchanged rules: all Aurora UI and slice 1 constraints still apply (Next 16 `cacheComponents`, tokens, reduced motion, accessibility, plain `<img>`, money in cents, ID-only matching, secrets).
- Secrets: `POKEMONPRICETRACKER_API_KEY` goes in `.env.local` / `.env.example` (empty value in the example, plus a test like the CardTrader one).
- Validation: both new sources go through `fetchJson` with zod schemas and timeouts.
- Tests: no test touches the network; fakes only.

## 6. Who decided what

The owner decided:
- Sections Singles, Slabs, Sealed (with boosters, bundles, displays, ETBs, UPCs and the like).
- Each lists products with their cheapest offer against the market value, deals highlighted.
- English and German only, everywhere.
- Slabs come later (after this step) via eBay plus PokemonPriceTracker, shown even with few sales and a warning.
- Tabs layout (option A).
- Cardmarket stays the main market value, with the US English-only price as a second reference (Claude's suggestion, accepted).
- Build Singles and Sealed first.
- The owner provided a PokemonPriceTracker key (free tier).
- They accepted the playback ("it's okay").

Claude's calls, to be checked:
- ECB as the exchange-rate source.
- US prices fetched once a day, with a credit guard.
- Singles default to €5+, sorted by market value. Sealed sorted by type, then value.
- Products without an English/German offer stay visible.
- Tab, filter and type state lives in the URL.
- Product pictures and TCGplayer IDs are stored on products.
- Only English/German listings are stored from now on.
- The chip names and the category mapping.
- The deal glow uses the existing rules.

## 7. Details settled after the builder check (Claude's calls)

1. Which price is compared.
   - The row shows the cheapest offer by item price.
   - Its difference and glow both come from running the existing `scoreListing` (+ `markStaleListing`) on that one offer. The pill shows `−discountPct`, which uses price plus known shipping; CardTrader's shipping is always unknown today, so that's the item price.
   - Pill and glow therefore can't disagree.
2. Displayed offer vs. deal.
   - The row always shows the cheapest offer, and the glow and click follow it.
   - With English/German, EUR and condition filtered in the query, the only way a pricier offer could be a deal while the cheapest isn't is staleness, which is acceptable.
3. Currency. Only EUR offers count. That covers the displayed offer and the "Offers" count. Every CardTrader offer seen so far was EUR; a non-EUR offer is simply not listed.
4. TCGplayer ID mapping.
   - A product gets a `tcgplayer_id` only when all blueprints that match it (by the existing exact-one-tracked-ID rule in `normalizeCtProduct`) agree on one TCGplayer ID.
   - If the same TCGplayer ID ends up on more than one product, set it to null on all of them, so a US price is never mislabelled.
   - The column isn't unique; the rule enforces this instead.
5. Pictures and IDs without listings.
   - Ingestion walks all blueprints of the matching expansions (they're already fetched) to fill `products.image_url` and `products.tcgplayer_id`, whether or not they have offers.
   - The provider returns blueprint metadata next to its listings, for example as a `products` array of `{ cardmarketProductId, imageUrl, tcgplayerId }`.
6. Old non-English/German rows. They're kept, and the sweep marks them unavailable on the next run. No cleanup migration. As a safety net, every query for the feed and the new tables also filters `language in ('en','de')` and `available`.
7. 25-offer cap.
   - Each per-language call returns that language's 25 cheapest offers per blueprint, which is all we need to know its cheapest English or German offer. No paging.
   - `products.kind` already exists (`single` / `sealed`) and drives the Singles/Sealed split.
   - The Slabs tab has no count.
8. Tab counts. Deals = the feed's deal count, the same as "Deals now". Singles = the €5+ count, whatever the switch shows. Sealed = all tracked sealed products. Chips and switches don't change the labels.
9. Stale US data.
   - A US price older than 7 days shows "–".
   - If the newest exchange rate is older than 7 days, the whole US column shows "–".
10. Category mapping, checked against the live database (2026-10-19). The distinct sealed `products.category_name` values are exactly `Pokémon Elite Trainer Boxes`, `Pokémon Display`, `Pokémon Booster`, `Pokémon Box Set`, `Pokémon Tins`, `Pokémon Blisters`, `Pokémon Theme Decks`. That matches §4.3, and "Other" catches future ones.

Left to the builder:
- Component split.
- Query shape (one query per tab, or a shared one).
- Exact responsive behaviour of the table (it can become cards on narrow screens).
- Skeletons for the tabs.
