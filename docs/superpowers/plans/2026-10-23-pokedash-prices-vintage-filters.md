# EN/DE prices, WOTC vintage sets and filters: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure every offer against current English/German offers of the same card, edition and condition, add the 15 English WOTC sets with 1st Edition, Shadowless and Unlimited editions, and add sorting plus rarity, set, edition and condition filters.

**Architecture:**
- **Tracked sets:** `TrackedSet` grows from one hard-coded set to a list of sets with explicit CardTrader expansion ids, an era and per-set deal conditions.
- **Listings:** each listing gains `edition` and `rarity`.
- **Reference value:** a new pure module computes it per listing (the second-cheapest *other* fresh EN/DE offer in the same product, edition, condition group and reverse-holo state). The deal feed and the section tables use it instead of Cardmarket's all-language price guide, which stays only as a note.
- **Filters:** they extend the existing URL params and the no-JS filter bar.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents`), React 19, TypeScript strict, Tailwind v4, Drizzle + postgres-js, Vitest 5 + Testing Library + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-23-pokedash-prices-vintage-filters-design.md`. Read §3 to §8 before any task.

## Global Constraints

**Prices and deals**
- Only English (`en`) and German (`de`) listings count, in EUR. Matching stays ID-based via CardTrader `card_market_ids`.
- **Reference value** = the median of the 3 cheapest *other* listings in the same group. That is simply the **second-cheapest other** listing. Fewer than 3 other listings means no reference, and the card shows the copy `Too few EN/DE offers to compare`.
- **Group** = same product, same `edition`, same condition group, and same `isReverseHolo`.
  - Condition groups: `mint` and `near_mint` → `nm`; `slightly_played` → `sp`; `moderately_played` → `mp`. Any other condition is in no group.
- **Pool:** listings that are `available`, `en`/`de`, EUR, and last seen within 72 h. Prices are item price only (`priceCents`).
- **Deal:** at least 20% below the reference (`minDiscountPct: 0.2`).
  - The reference must be at least €5 (`minBenchmarkCents: 500`).
  - The "Unusually cheap" warning stays at ≥60% (`suspiciousDiscountPct: 0.6`).
- **Deal conditions:** modern sets keep `['mint','near_mint']`; vintage sets use `['mint','near_mint','slightly_played','moderately_played']`.

**Editions**
- **Values:** `'first_edition' | 'shadowless' | 'unlimited'`.
- **Rules:**
  - 1st Edition: `properties_hash.first_edition === true`, and only in sets with `hasFirstEdition: true`.
  - Shadowless: a listing from CardTrader expansion 1969 that isn't 1st Edition.
  - Unlimited: everything else.
- **Sets with `hasFirstEdition: true`:** Base Set, Jungle, Fossil, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis, Neo Discovery, Neo Revelation and Neo Destiny. Base Set 2, Legendary Collection, Expedition, Aquapolis and Skyridge have `false`.

**WOTC sets** (CardTrader ids → Cardmarket expansion ids, verified 2026-10-23):

| Set | CardTrader id | Cardmarket expansion id |
|---|---|---|
| Base Set | 1472, plus Shadowless 1969 | 1523 |
| Jungle | 1473 | 1525 |
| Fossil | 1476 | 1526 |
| Base Set 2 | 1478 | 1527 |
| Team Rocket | 1479 | 1528 |
| Gym Heroes | 1480 | 1529 |
| Gym Challenge | 1481 | 1530 |
| Neo Genesis | 1482 | 1531 |
| Neo Discovery | 1483 | 1532 |
| Neo Revelation | 1485 | 1533 |
| Neo Destiny | 1486 | 1534 |
| Legendary Collection | 1487 | 1535 |
| Expedition Base Set | 1488 | 1536 |
| Aquapolis | 1491 | 1537 |
| Skyridge | 1492 | 1538 |

`excludedCategories: ['Pokémon Coins']` for each. Sealed products live in the same expansions.

**Other data rules**
- **Rarity:** from the offer's `properties_hash.pokemon_rarity` (string). A missing rarity shows as `No rarity`.
- **US prices** (PokemonPriceTracker): only for sets with `usPrices: true`, which is 30th Celebration only.

**Unchanged rules**
- Auth: `requireAal2()` stays first.
- No new dependencies. `npm audit` stays at 0.
- Request data stays inside the existing `<Suspense>` after `await connection()`.
- Copy is English. Controls are at least 44 px tall, with visible labels.
- The ingest must stay inside GitHub's 15-minute job limit.
- Never read `.env.local` or `.env.supabase`.
- Commit with explicit paths, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Edition edge cases.**
   - A Shadowless-expansion offer with `first_edition: true` is 1st Edition.
   - A Base Set 2 offer with `first_edition: true` is Unlimited.

   Pinned in Task 1.
2. **Stale listings never move the reference.** A cheap listing last seen 4 days ago is not in the pool, and is never a deal. Pinned in Task 3.
3. **Condition isolation.** A Slightly Played listing is never compared with Near Mint ones. In a modern set it is never a deal, even if it is far below. Pinned in Task 3.
4. **The minimum-offers boundary.** A group of exactly 3 listings gives every member only 2 others, so no reference. A group of 4 gives references. Tied prices `[10, 10, 10, 10]` give a reference of 10, 0% below and no deal. Pinned in Task 3.
5. **Rarity values with spaces and `&`** (`Illustration Rare`, a hypothetical `Rare & Holo`) round-trip through the URL as repeated `rarity=` params without throwing. Pinned in Task 5.

---

### Task 1: Sets, editions and rarity from CardTrader

**Files:**
- Modify:
  - `src/config/sets.ts`
  - `src/domain/types.ts` (`NormalizedListing`, a new `Edition` type)
  - `src/providers/cardtrader/normalize.ts`
  - `src/providers/cardtrader/provider.ts`
  - `src/config/settings.ts`
- Test: `src/providers/cardtrader/normalize.test.ts`, `src/providers/cardtrader/provider.test.ts`, `src/config/sets.test.ts` (new)

**Interfaces:**
- **Produces, in `domain/types.ts`:**
  - `export type Edition = 'first_edition' | 'shadowless' | 'unlimited'`
  - `NormalizedListing` gains `edition: Edition; rarity: string | null`
- **Produces, in `config/sets.ts`:**
  - `TrackedSet` gains:
    - `era: 'modern' | 'vintage'`
    - `cardtraderExpansionIds?: number[]`, used instead of `cardtraderExpansionPrefix` when present
    - `shadowlessExpansionId?: number`
    - `hasFirstEdition: boolean`
    - `usPrices: boolean`
  - 15 exported WOTC set constants, each with a `key`: `base-set`, `jungle`, `fossil`, `base-set-2`, `team-rocket`, `gym-heroes`, `gym-challenge`, `neo-genesis`, `neo-discovery`, `neo-revelation`, `neo-destiny`, `legendary-collection`, `expedition`, `aquapolis`, `skyridge`.
  - The 15 constants are added to `TRACKED_SETS` after `THIRTIETH_CELEBRATION`, which itself gets `era: 'modern'`, `hasFirstEdition: false` and `usPrices: true`.
  - `findSet(key: string): TrackedSet | undefined`
- **Produces, in `config/settings.ts`:** `dealConditionsFor(set: TrackedSet): Condition[]`.
- **Produces, in `normalize.ts`:** `normalizeCtProduct(p, blueprint, tracked, ctx: { set: TrackedSet; expansionId: number })`. It sets `edition` per the Global Constraints and `rarity` from `properties_hash.pokemon_rarity`.
- **Changes in `provider.ts`:**
  - Pick expansions by `set.cardtraderExpansionIds` when present, else by prefix as today.
  - Pass `{ set, expansionId: expansion.id }` to the normalizer.
  - Memoise `client.expansions()` for the client's lifetime, so 16 sets cost one call.

- [ ] **Step 1: Write the failing tests**
  - **`sets.test.ts`:**
    - `TRACKED_SETS` has 16 entries with unique `key`s.
    - Base Set has `cardtraderExpansionIds [1472, 1969]`, `shadowlessExpansionId 1969` and `cardmarketExpansionIds [1523]`.
    - Base Set 2 has `hasFirstEdition false`.
    - Only 30th Celebration has `usPrices true`.
    - `dealConditionsFor(baseSet)` includes `'moderately_played'`; `dealConditionsFor(THIRTIETH_CELEBRATION)` is `['mint','near_mint']`.
  - **`normalize.test.ts`:**
    - Base Set (1472) with `first_edition: true` → `'first_edition'`.
    - Base Set (1472) with `first_edition: false` → `'unlimited'`.
    - Shadowless expansion (1969) with `false` → `'shadowless'`.
    - Shadowless expansion (1969) with `true` → `'first_edition'` (Review Focus 1).
    - Base Set 2 (1478) with `true` → `'unlimited'` (Review Focus 1).
    - `pokemon_rarity: 'Holo Rare'` → `rarity 'Holo Rare'`; missing → `null`.
  - **`provider.test.ts`:**
    - A set with `cardtraderExpansionIds [1472, 1969]` fetches exactly those two expansions' blueprints and offers, even when other expansions' names share the prefix.
    - `client.expansions` is called once across two `fetchListings` calls on the same provider.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/config src/providers/cardtrader`
- [ ] **Step 3: Implement.** Update `test/fixtures/listings.ts` `makeListing` defaults (`edition: 'unlimited'`, `rarity: null`) and every other caller the type change breaks.
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint`
- [ ] **Step 5: Commit** with the message `feat: WOTC sets, editions and rarity from CardTrader`.

---

### Task 2: Store edition and rarity, ingest many sets efficiently

**Files:**
- Modify:
  - `src/db/schema.ts`
  - `src/ingest/listings.ts`
  - `src/ingest/run.ts`
  - `src/ingest/usPrices.ts` (or its call site in `run.ts`)
- Create: the migration `drizzle/0008_*.sql`, through `npx drizzle-kit generate`
- Test: `src/ingest/listings.test.ts`, `src/ingest/run.test.ts`, `test/db-security.test.ts` (it must keep passing)

**Interfaces:**
- **Consumes:** `NormalizedListing.edition` and `.rarity`, and `TrackedSet.usPrices` (Task 1).
- **Produces, schema `listings`:**
  - `edition text not null default 'unlimited'`
  - `rarity text` (nullable)
  - indexes `listings_product_id_idx` on `(product_id)` and `listings_available_language_idx` on `(available, language)`
- **Produces, schema `products`:** `rarity text` (nullable), set from the first non-null `rarity` among that product's listings in the run.
- **Produces, in `run.ts`:** within one `runIngestion` call, `deps.fetchJson` is memoised per URL, so the Cardmarket catalogs and the price guide download once, not once per set. US prices are fetched only for sets with `usPrices`.
- **Unchanged:** batched writes (500 rows) and the `excluded.*` upsert pattern, extended with `edition` and `rarity`.
- **Note:** the new columns need no grant changes, because table-level grants cover new columns. The security test must still pass.

- [ ] **Step 1: Write the failing tests**
  - **`listings.test.ts`:**
    - An ingested listing keeps `edition 'first_edition'` and `rarity 'Holo Rare'`.
    - A second run with `edition` changed updates it.
    - `products.rarity` is set to the listing's rarity.
  - **`run.test.ts`:**
    - With two tracked sets in one run, the fake `fetchJson` is called once per distinct URL (3 Cardmarket URLs total).
    - The PPT client's methods aren't called for a set with `usPrices: false`.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/ingest`
- [ ] **Step 3: Implement.** Generate the migration with `npx drizzle-kit generate`.
- [ ] **Step 4: Verify**
  - Run: `npm test && npm run typecheck && npm run lint`
  - Run: `npm run db:migrate` (local Docker)
  - Run: `time npm run ingest -- --listings` against the local DB. Record the duration and the per-set counts in your report. The run must stay well under 15 minutes.
- [ ] **Step 5: Commit** with the message `feat: store edition and rarity, ingest many sets with one catalog download`.

---

### Task 3: Reference values and the deal feed

**Files:**
- Create: `src/deals/reference.ts`, `src/deals/reference.test.ts`
- Modify:
  - `src/deals/feed.ts`
  - `src/scoring/score.ts`
  - `src/domain/types.ts` (the `BenchmarkAssessment.basis` union)
- Test: `src/deals/feed.test.ts`

**Interfaces:**
- **Produces, in `reference.ts`:**
  - `type ConditionGroup = 'nm' | 'sp' | 'mp'`
  - `conditionGroup(c: Condition | null): ConditionGroup | null`
  - `interface PoolListing { id: number; productId: number; edition: Edition; condition: Condition | null; isReverseHolo: boolean; priceCents: number; language: string | null; currency: string; available: boolean; lastSeenAt: Date }`
  - `referenceValues(pool: PoolListing[], now: Date, maxAgeHours: number): Map<number, number | null>`. This gives, for every listing id in the pool, the second-cheapest *other* eligible listing in its group, or `null`. Ineligible listings (stale, wrong language, non-EUR, no condition group) are neither in any group nor given a reference.
  - `cheapestReference(prices: number[]): number | null`, which is the median of the 3 cheapest (`prices` sorted ascending, `[1]`) or `null` under 3. Task 4 uses it for the market value column.
- **Produces, in `feed.ts`:**
  - `getDealFeed` builds `BenchmarkAssessment` from `referenceValues`:
    - `basis: 'en_de_offers'`
    - `confidence: 'high'` with a value, else `'insufficient'` with `reasons: ['Too few EN/DE offers to compare']`
    - `capturedAt: now`
  - It uses `dealConditionsFor(findSet(product.setKey))`.
  - `DealView` gains:
    - `edition: Edition`
    - `rarity: string | null`
    - `setKey: string`
    - `cardmarketValueCents: number | null`: the old trend value (`trendHolo` for reverse holo), for the "all languages" note
    - `cardmarketProductId: number`
- **Changes in `score.ts`:** for `confidence 'insufficient'`, the not-deal reason is `benchmark.reasons[0] ?? 'Not enough sales data'`.
- **Changes in `types.ts`:** `BenchmarkAssessment.basis` becomes `'trend' | 'trend_holo' | 'en_de_offers'`.

- [ ] **Step 1: Write the failing tests**
  - **`reference.test.ts`:**
    - Group NM prices `[86.64, 90.04, 91.98, 92.60]`: the €86.64 listing gets €91.98, the €90.04 listing gets €91.98, and the €92.60 listing gets €90.04.
    - A group of exactly 3 gives `null` for all; ties `[1000, 1000, 1000, 1000]` give 1000 (Review Focus 4).
    - An SP listing among NM listings is only grouped with SP listings (Review Focus 3).
    - A listing last seen 4 days before `now` at €10 doesn't change the others' reference and gets `null` itself (Review Focus 2).
    - Reverse holo and normal listings, and different editions, never mix.
    - Italian and USD listings are ignored.
    - `cheapestReference([5, 1, 3])` is 3; `cheapestReference([1, 2])` is `null`.
  - **`feed.test.ts`:**
    - A modern-set NM listing at 20% below its reference is a deal.
    - A modern-set SP listing at 50% below is not a deal, with reason `Condition below Near Mint` (Review Focus 3).
    - A vintage (Base Set) MP listing at 30% below its MP-group reference is a deal.
    - A product with only 2 listings gives not-deal reason `Too few EN/DE offers to compare`.
    - `DealView` carries `edition`, `rarity`, `setKey` and `cardmarketValueCents`.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/deals src/scoring`
- [ ] **Step 3: Implement.** Keep sorting by € saving. Fix any existing feed and slice tests whose expectations depended on the price guide, and record which ones in the report.
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint`
- [ ] **Step 5: Commit** with the message `feat: measure deals against current EN/DE offers of the same card, edition and condition`.

---

### Task 4: Section tables on reference values, by set and edition

**Files:**
- Modify: `src/deals/sections.ts`, `src/deals/stats.ts`
- Test: `src/deals/sections.test.ts`, `src/deals/stats.test.ts`

**Interfaces:**
- **Consumes:** `cheapestReference` and `conditionGroup` (Task 3), and `findSet` (Task 1).
- **Produces, in `getSectionRows`:**
  - Its opts gain `edition?: Edition`, `rarities?: string[]`, `conditionGroup?: ConditionGroup` (default `'nm'`) and `sort?: SortKey`.
  - `SectionRow.benchmark.valueCents` becomes `cheapestReference` of the fresh EN/DE offers in the chosen edition and condition group (`null` → "too few offers"). Any `language` option narrows them further.
  - `SectionRow` gains `cardmarketValueCents: number | null`, `rarity: string | null`, `edition: Edition` and `cardmarketProductId: number`.
  - The offer is the cheapest in that edition and condition group.
  - The `rarities` filter matches `product.rarity`; the value `No rarity` matches `null`.
  - The Singles "Worth €5+" filter now uses the new value.
- **Produces:**
  - `export type SortKey = 'saving' | 'cheapest' | 'expensive'`
  - `sortRows(rows: SectionRow[], sort: SortKey | undefined): SectionRow[]`:
    - `cheapest`: offer price ascending, rows without an offer last
    - `expensive`: offer price descending
    - `saving`: discount ascending (most below first)
    - `undefined`: today's default (market value)
  - `getAvailableRarities(db, setKey): Promise<string[]>`, sorted, with `No rarity` last when some product has none.
- **Produces, in `stats.ts`:** `getFeedStats(db, setKey | null)`, where `null` means across all tracked sets. The same applies to `getSectionCounts`.

- [ ] **Step 1: Write the failing tests**
  - **`sections.test.ts`:**
    - For a Base Set single with 4 Unlimited NM offers and 3 1st Edition NM offers: the `edition: 'unlimited'` value is the 2nd cheapest Unlimited offer, and the `first_edition` value is `null` (only 3).
    - `rarities: ['Holo Rare']` keeps only Holo Rare products; `['No rarity']` keeps products with `rarity null`.
    - `conditionGroup: 'sp'` picks SP offers only.
    - `sortRows` orders correctly for each key, with rows without an offer last.
  - **`stats.test.ts`:** `getFeedStats(db, null)` counts listings across two seeded sets.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/deals`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint`
- [ ] **Step 5: Commit** with the message `feat: section tables valued by EN/DE offers, per set, edition, rarity and condition`.

---

### Task 5: Filters, sorting and the set/edition UI

**Files:**
- Modify:
  - `src/lib/params.ts` (+ test)
  - `src/deals/filters.ts` (+ test)
  - `src/components/FilterBar.tsx` (+ test)
  - `src/components/SectionTabs.tsx`
  - `src/components/SectionTable.tsx` (+ test)
  - `src/components/TopBar.tsx`
  - `src/app/page.tsx`
- Create: `src/components/EditionTabs.tsx` (+ test)

**Interfaces:**
- **Consumes:** `SortKey`, `getAvailableRarities` and the opts of `getSectionRows` (Task 4); `findSet` and `TRACKED_SETS` (Task 1); the `DealView` fields (Task 3).
- **Produces, in `params.ts`:** `DashboardParams` gains:
  - `set: string | null`: a known key, else `null`; `null` means all sets on Deals and the first tracked set on Singles/Sealed
  - `edition: Edition | null`
  - `condition: ConditionGroup | null`
  - `rarities: string[]`: the repeated `rarity=` params, deduplicated, each trimmed and capped at 60 code points, at most 20
  - `sort: SortKey | null`

  `dashboardHref` keeps `set`, `rarity` and `sort` across tabs, drops `edition` when the target set isn't vintage, and encodes each `rarity` separately.
- **Produces, in `filters.ts`:** `filterDeals` also filters by `set`, `edition`, `condition` (by group) and `rarities`, then applies `sort`. The default stays biggest € saving.
- **Produces, in `FilterBar`:**
  - `<select name="sort">` labelled **Sort by**: `Biggest saving`, `Cheapest first`, `Most expensive first`
  - `<select name="set">` labelled **Set**: `All sets` (Deals only), then optgroups `Modern` and `WOTC`, with each set's `name`
  - `<select name="rarity" multiple>` labelled **Rarity**, with options from `getAvailableRarities` for the chosen set, or for all sets on Deals with set = all
  - `<select name="condition">` labelled **Condition**, shown only when the chosen set is vintage or set = all: `Near Mint`, `Slightly Played`, `Moderately Played`
  - The edition choice is not in the bar; it is **EditionTabs**.
- **Produces, `EditionTabs({ params, set })`:**
  - Rendered under `SectionTabs` when the chosen set is vintage.
  - Links: `1st Edition`, `Shadowless` (only when `set.shadowlessExpansionId`) and `Unlimited`, the default.
  - Each link is `dashboardHref(params, { edition })`, with `aria-current` on the active one.
- **Changes in `TopBar`:** the chip shows the chosen set's name or `All sets`.
- **Changes in `SectionTable`:**
  - **Market value column:** the value or the muted copy `Too few offers`.
  - **Under it:** `Cardmarket €X (all languages)`, when `cardmarketValueCents` is not null.
  - **Header:** `Cheapest EN/DE` stays language-aware.
  - **Badges:** a rarity badge for each card.

- [ ] **Step 1: Write the failing tests**
  - **`params.test.ts`:**
    - `parse({ rarity: ['Illustration Rare', 'Rare & Holo'] }).rarities` equals both values, and `dashboardHref` emits `rarity=Illustration%20Rare&rarity=Rare%20%26%20Holo` (Review Focus 5).
    - `rarity` repeated 30 times keeps 20.
    - An unknown `set` gives `null`.
    - `edition=first_edition` is kept.
    - `sort=cheapest` is kept; `sort=foo` gives `null`.
    - Switching to a modern set drops `edition`.
  - **`filters.test.ts`:** set, edition, condition-group and rarity filtering, and the three sorts.
  - **`FilterBar.test.tsx`:**
    - Sort, Set and Rarity are labelled; Condition shows only for vintage or all sets.
    - The selected options are pre-filled.
    - The rarity options come from the `rarities` prop.
  - **`EditionTabs.test.tsx`:**
    - Base Set shows 3 links and Jungle 2, with no Shadowless.
    - The active one has `aria-current="page"`.
    - Hrefs keep `q` and `set`.
  - **`SectionTable.test.tsx`:** it shows `Too few offers` for a `null` value and the `Cardmarket €… (all languages)` note.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/lib src/deals src/components`
- [ ] **Step 3: Implement.** In `page.tsx`, keep `requireAal2()` first, read the set from params, and pass the new options through.
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint && npm run build`
- [ ] **Step 5: Commit** with the message `feat: sorting, rarity, set, edition and condition filters`.

---

### Task 6: "Check on Cardmarket" link and docs

**Files:**
- Create: `src/lib/cardmarket.ts` (+ test)
- Modify:
  - `src/components/DealTile.tsx`
  - `src/components/HeroDeal.tsx`
  - `src/components/SectionTable.tsx`
  - `README.md` (data sources and schedule)

**Interfaces:**
- **Produces:** `cardmarketCheckUrl(cardmarketProductId: number, productName: string): string`. It is an `https://www.cardmarket.com/en/Pokemon/...` URL that opens the product filtered to English + German, minimum Near Mint.
  - **Verify the exact URL format by hand once** in a normal browser or with a single `curl -sI`: whether a product can be addressed by id, for example `/en/Pokemon/Products?idProduct=<id>`, and which query parameters set the language and minimum condition, for example `language=1,3&minCondition=2`. Document the verified format in a code comment.
  - If id addressing doesn't work, fall back to Cardmarket's search URL with the product name, plus the same filter parameters.
  - Never fetch Cardmarket pages from the app or the ingest.
- **Links:** "Check on Cardmarket" (`target="_blank"`, `rel="noopener noreferrer"`), at least 44 px tall, in `DealTile`, `HeroDeal` and every `SectionTable` row.
- **Edition badge (spec §4):** for vintage deals, `DealTile` and `HeroDeal` show an edition badge (`1st Edition`, `Shadowless` or `Unlimited`) next to the existing language and condition badges. Test it in `DealFeed.test.tsx`: a 1st Edition deal shows `1st Edition`, and a modern deal shows no edition badge.
- **README:**
  - **"Data sources":** the market value is now from current CardTrader EN/DE offers; Cardmarket's price guide is only a note.
  - **The set list.**
  - **The measured ingest duration from Task 2,** plus the schedule decision per spec §8.7. If vintage needs its own schedule, add it as a workflow step in this task, with the same concurrency group and limits.

- [ ] **Step 1: Write the failing test.** `cardmarketCheckUrl(123, 'Gengar ex')` matches the verified format, encodes the name if it is used, and contains the EN+DE and Near Mint parameters.
- [ ] **Step 2: Run it and watch it fail**

  Run: `npx vitest run src/lib/cardmarket.test.ts`
- [ ] **Step 3: Implement it and add the links.**
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint && npm run build`
- [ ] **Step 5: Commit** with the message `feat: check-on-Cardmarket link, docs for the new sets and prices`.
