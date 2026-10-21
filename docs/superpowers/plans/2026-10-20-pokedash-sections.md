# pokedash Singles and Sealed Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Deals / Singles / Sealed / Slabs (soon) tabs. Every product shows its cheapest English/German offer next to its Cardmarket market value and a US English-only reference price. Fetch CardTrader offers per language so English/German offers stop being crowded out.

**Architecture:** Five tasks.
1. The CardTrader provider asks per language and also returns product metadata (picture, TCGplayer ID) for every tracked product.
2. A shared HTTP core adds text and header-aware fetches, plus the ECB exchange rate.
3. A PokemonPriceTracker client and a daily US-price ingest step, wired into `runIngestion` and the CLI.
4. A `getSectionRows` query builds the rows from listings, snapshots, US prices and FX.
5. Server-rendered tabs and tables, driven by URL parameters.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents`), React 19, Tailwind v4, Drizzle + Postgres (PGlite in tests), zod 4, Vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-pokedash-sections-design.md`. Approved mockup: `docs/superpowers/specs/assets/2026-10-20-sections-tabs-mockup.html`.

**Branch:** `feat/next-features` (it already contains the Aurora UI).

## Global Constraints

- All Aurora UI and slice 1 constraints still apply:
  - Next 16 `cacheComponents` (request data inside `<Suspense>` + `await connection()`)
  - tokens and fonts from `globals.css`
  - motion stops under `prefers-reduced-motion`
  - WCAG AA, focus rings, ≥44 px targets
  - plain lazy `<img>` via `CardImage`
  - money as integer cents
  - ID-only matching
  - secrets only from env, never logged, never in errors, never in the browser
- English and German only. Every query that shows offers filters `language in ('en','de')` and `available = true`. Only `currency = 'EUR'` offers are shown or counted.
- Deals are judged against Cardmarket only, with the existing `scoreListing` + `markStaleListing` rules. The US price is never used for deal decisions.
- PokemonPriceTracker: base `https://www.pokemonpricetracker.com/api/v2`, header `Authorization: Bearer <POKEMONPRICETRACKER_API_KEY>`.
  - Cards: `GET /cards?tcgPlayerId=<id>`, using `prices.market` (USD).
  - Sealed: `GET /sealed-products?tcgPlayerId=<id>`, using `unopenedPrice` (USD).
  - At most once per product per UTC day.
  - Stop when the `X-RateLimit-Daily-Remaining` header is below 10.
  - About 1100 ms between calls.
- ECB: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, matching `time='YYYY-MM-DD'` and `currency='USD' rate='1.1225'`.
  - The rate means 1 € = rate USD.
  - Conversion: `eurCents = Math.round(usdCents / usdPerEur)`.
- Staleness: a US price or exchange rate older than 7 days shows "–".
- Singles "worth €5+" means a Cardmarket market value of ≥ 500 cents (`SINGLES_MIN_VALUE_CENTS = 500`).
- Tests: Vitest, DB tests on in-memory PGlite with the real migrations, no network.
- Commits: explicit paths only (never `git add -A`). Never open or print `.env.local`.

## Review Focus

1. PokemonPriceTracker credits run out mid-run: the step stops early, keeps the prices it already fetched, and fetches the rest tomorrow. Test: Task 3 `stops when daily credits run low`.
2. Two products end up with the same TCGplayer ID: neither gets a US price. Test: Task 1 `drops a TCGplayer id that maps to two products`.
3. A week-old US price or exchange rate: the US column shows "–" instead of an old number. Test: Task 4 `hides US prices older than 7 days`.
4. A product with no English/German offer: it's still listed, as "no EN/DE offer yet", with its picture. Tests: Task 4 `lists products without an EN/DE offer` and Task 5 `shows a product without an offer`.
5. Unknown or missing tab/type parameters in the URL: fall back to the Deals tab / all sealed types without crashing. Test: Task 5 `falls back to defaults for unknown parameters`.

---

### Task 1: CardTrader per-language offers and product metadata

**Files:**
- Modify: `src/providers/cardtrader/schema.ts` (blueprint `tcg_player_id`), `src/providers/cardtrader/client.ts` (`marketplaceProducts` language), `src/providers/cardtrader/provider.ts`, `src/providers/types.ts` (`ProviderResult.products`), `src/db/schema.ts` (`products.imageUrl`, `products.tcgplayerId`), `src/ingest/listings.ts` (write metadata), `test/helpers/fake-provider.ts` (`products: []`), `test/fixtures/cardtrader.ts` (if needed)
- Create: `src/providers/cardtrader/meta.ts`, `drizzle/0002_*.sql` (via `npm run db:generate`)
- Test: `src/providers/cardtrader/meta.test.ts`, `src/providers/cardtrader/provider.test.ts`, `src/ingest/listings.test.ts`, `test/slice.test.tsx` (fake client signature)

**Interfaces:**
- Consumes: `normalizeCtProduct`, `safeCardTraderImageUrl` (existing).
- Produces:

```ts
// schema.ts: blueprint gains
tcg_player_id: z.number().nullish()
// client.ts
marketplaceProducts(expansionId: number, language: 'en' | 'de'): Promise<Record<string, CtProduct[]>>
// → GET /marketplace/products?expansion_id=<id>&language=<lang>
// types.ts
export interface ProductMeta { cardmarketProductId: number; imageUrl: string | null; tcgplayerId: number | null }
export interface ProviderResult { listings: NormalizedListing[]; skipped: {...}[]; products: ProductMeta[] }
// meta.ts
export function collectProductMeta(blueprints: CtBlueprint[], tracked: ReadonlySet<number>): ProductMeta[]
// db: products.imageUrl text('image_url') nullable; products.tcgplayerId integer('tcgplayer_id') nullable
```

`collectProductMeta` rules (spec §3.2 and §7.4):
- A blueprint counts for a product only if exactly one of its `card_market_ids` is in `tracked`.
- `tcgplayerId`:
  - Collect the distinct non-null `tcg_player_id`s of the product's blueprints: exactly one gives that ID, otherwise `null`.
  - Then, if the same TCGplayer ID ended up on more than one product, set it to `null` on all of them.
- `imageUrl`: the first non-null `safeCardTraderImageUrl(image_url)` among the product's blueprints, in ascending blueprint ID order.
- Output: one entry per tracked product that had at least one counting blueprint, sorted by `cardmarketProductId`.

- [ ] **Step 1: Write the failing tests**

`src/providers/cardtrader/meta.test.ts`:

```ts
const tracked = new Set([909509, 909510, 895551]);
it('takes the image and the single TCGplayer id of a product', () => {
  expect(collectProductMeta([
    ctBlueprint({ id: 2, card_market_ids: [895551], tcg_player_id: 704143, image_url: 'https://cardtrader.com/b.jpg' }),
    ctBlueprint({ id: 1, card_market_ids: [895551], tcg_player_id: 704143, image_url: null }),
  ], tracked)).toEqual([{ cardmarketProductId: 895551, imageUrl: 'https://cardtrader.com/b.jpg', tcgplayerId: 704143 }]);
});
it('uses no TCGplayer id when a product has two different ones', () => {
  expect(collectProductMeta([
    ctBlueprint({ id: 1, card_market_ids: [909509], tcg_player_id: 1 }),
    ctBlueprint({ id: 2, card_market_ids: [909509], tcg_player_id: 2 }),
  ], tracked)[0].tcgplayerId).toBeNull();
});
it('drops a TCGplayer id that maps to two products', () => {
  const meta = collectProductMeta([
    ctBlueprint({ id: 1, card_market_ids: [909509], tcg_player_id: 7 }),
    ctBlueprint({ id: 2, card_market_ids: [909510], tcg_player_id: 7 }),
  ], tracked);
  expect(meta.map((m) => m.tcgplayerId)).toEqual([null, null]);
});
it('ignores blueprints that match no or several tracked products, and unsafe images', () => {
  expect(collectProductMeta([
    ctBlueprint({ id: 1, card_market_ids: [123] }),
    ctBlueprint({ id: 2, card_market_ids: [909509, 909510] }),
    ctBlueprint({ id: 3, card_market_ids: [895551], image_url: 'http://evil.example/x.jpg', tcg_player_id: null }),
  ], tracked)).toEqual([{ cardmarketProductId: 895551, imageUrl: null, tcgplayerId: null }]);
});
```

`provider.test.ts`:
- The fake client's `marketplaceProducts` becomes `(id, language) =>`. It returns one offer for `en` and one for `de` with distinct ids.
- Update `collects listings from every matching expansion only`: listings now come from both languages. Assert `marketplaceProducts` was called with `(501, 'en')` and `(501, 'de')`, and that `result.products` lists the tracked products of the blueprints.
- Update the client test: its expected URL becomes `…/marketplace/products?expansion_id=501&language=en`.

`listings.test.ts` (add):

```ts
it('stores product pictures and TCGplayer ids from the provider', async () => {
  const provider = { marketplace: 'cardtrader' as const, fetchListings: async () => ({
    listings: [], skipped: [], products: [{ cardmarketProductId: 895551, imageUrl: 'https://cardtrader.com/etb.jpg', tcgplayerId: 704143 }] }) };
  await ingestListings(db, provider, SET, T1);
  const [etb] = await db.select().from(products).where(eq(products.cardmarketId, 895551));
  expect(etb).toMatchObject({ imageUrl: 'https://cardtrader.com/etb.jpg', tcgplayerId: 704143 });
});
```

`test/slice.test.tsx` and `test/helpers/fake-provider.ts`: adapt to the new signatures. The fake client takes a `language` argument, and `fakeProvider` returns `products: []`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/providers/cardtrader src/ingest/listings.test.ts`
Expected: FAIL. `meta.ts` is missing, the provider makes only one marketplace call, and `products` is undefined.

- [ ] **Step 3: Implement**

- `client.ts`: add the `language` parameter to the URL. Keep the 120 ms delay before each marketplace call.
- `provider.ts`:
  - For each matching expansion: fetch blueprints, then `marketplaceProducts(id,'en')` and `marketplaceProducts(id,'de')`, and normalize both results.
  - Collect all blueprints of all matching expansions, and return `products: collectProductMeta(allBlueprints, tracked)`.
- Schema: add `imageUrl` and `tcgplayerId` to `products`, then run `npm run db:generate` (expect `drizzle/0002_*.sql` adding two nullable columns).
- `ingestListings`: inside the existing transaction, for each `ProductMeta` whose product is in this set, update `products.imageUrl` and `products.tcgplayerId`. Null values overwrite, so a now-ambiguous ID is cleared.

- [ ] **Step 4: Run the tests, then typecheck**

Run: `npm test`, then `npx tsc --noEmit`
Expected: all pass (+5 new tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cardtrader src/providers/types.ts src/db/schema.ts drizzle src/ingest/listings.ts src/ingest/listings.test.ts test/helpers/fake-provider.ts test/fixtures/cardtrader.ts test/slice.test.tsx
git commit -m "feat: fetch CardTrader offers per language and store product pictures and TCGplayer ids"
```

---

### Task 2: HTTP text/header fetches and the ECB exchange rate

**Files:**
- Modify: `src/lib/http.ts`, `src/db/schema.ts` (`fxRates`)
- Create: `src/providers/ecb.ts`, `src/ingest/fx.ts`, `drizzle/0003_*.sql`, `test/fixtures/ecb-daily.xml`
- Test: `src/lib/http.test.ts`, `src/providers/ecb.test.ts`, `src/ingest/fx.test.ts`

**Interfaces:**
- Consumes: the existing `fetchJson` retry/timeout behaviour, which must stay identical.
- Produces:

```ts
// http.ts: shared retrying core; fetchJson keeps its exact behaviour and signature
export function fetchJsonWithHeaders<T>(url: string, opts: FetchJsonOptions<T>): Promise<{ data: T; headers: Headers }>
export function fetchText(url: string, opts: Omit<FetchJsonOptions<unknown>, 'schema'>): Promise<string>
// ecb.ts
export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export function parseEcbUsdRate(xml: string): { rateDate: string; usdPerEur: number }  // throws if either part is missing or rate <= 0
// schema.ts
export const fxRates = pgTable('fx_rates', { rateDate: date('rate_date', { mode: 'string' }).primaryKey(), usdPerEur: doublePrecision('usd_per_eur').notNull() });
// fx.ts
export function ingestFxRate(db: Db, deps: { fetchText: (url: string) => Promise<string> }): Promise<{ rateDate: string; inserted: boolean }>
// fetches once, parses, inserts with onConflictDoNothing on rateDate
```

- [ ] **Step 1: Write the failing tests**

`test/fixtures/ecb-daily.xml`: a trimmed copy of the real file containing `<Cube time='2026-10-19'>`, `<Cube currency='USD' rate='1.1225'/>` and `<Cube currency='JPY' rate='168.45'/>`.

`src/providers/ecb.test.ts`:

```ts
it('reads the USD rate and its date', () => {
  expect(parseEcbUsdRate(readFileSync('test/fixtures/ecb-daily.xml', 'utf8'))).toEqual({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
});
it('rejects a file without a USD rate', () => {
  expect(() => parseEcbUsdRate("<Cube time='2026-10-19'><Cube currency='JPY' rate='168.45'/></Cube>")).toThrow();
});
```

`src/ingest/fx.test.ts` (PGlite):

```ts
it('stores the daily rate once', async () => {
  const db = await createTestDb();
  const deps = { fetchText: async () => readFileSync('test/fixtures/ecb-daily.xml', 'utf8') };
  expect(await ingestFxRate(db, deps)).toEqual({ rateDate: '2026-10-19', inserted: true });
  expect(await ingestFxRate(db, deps)).toEqual({ rateDate: '2026-10-19', inserted: false });
  expect(await db.select().from(fxRates)).toEqual([{ rateDate: '2026-10-19', usdPerEur: 1.1225 }]);
});
```

`src/lib/http.test.ts` (add; the existing 9 tests must pass unchanged):

```ts
it('returns headers with the parsed body', async () => {
  const d = setup(res(200, { ok: true }, { 'X-RateLimit-Daily-Remaining': '42' }));
  const r = await fetchJsonWithHeaders('https://x.test/a', { schema, ...d });
  expect(r.data).toEqual({ ok: true });
  expect(r.headers.get('X-RateLimit-Daily-Remaining')).toBe('42');
});
it('fetches text with the same retries', async () => {
  const d = setup(new Response('x', { status: 503 }), new Response('<xml/>', { status: 200 }));
  await expect(fetchText('https://x.test/a', d)).resolves.toBe('<xml/>');
  expect(d.fetchImpl).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/http.test.ts src/providers/ecb.test.ts src/ingest/fx.test.ts`
Expected: FAIL (missing exports and modules).

- [ ] **Step 3: Implement**

- `http.ts`: extract one private retrying `request(url, opts): Promise<Response>` that holds today's retry, timeout, `Retry-After` and error-wrapping logic. Build `fetchJson`, `fetchJsonWithHeaders` and `fetchText` on it.
- `ecb.ts`: two regexes (`time='(\d{4}-\d{2}-\d{2})'` and `currency='USD' rate='([0-9.]+)'`).
- Schema: add `fxRates`, then run `npm run db:generate` (expect `drizzle/0003_*.sql`).

- [ ] **Step 4: Run the tests, then typecheck**

Run: `npm test`, then `npx tsc --noEmit`
Expected: all pass (+5 new tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http.ts src/lib/http.test.ts src/providers/ecb.ts src/providers/ecb.test.ts src/ingest/fx.ts src/ingest/fx.test.ts src/db/schema.ts drizzle test/fixtures/ecb-daily.xml
git commit -m "feat: daily ECB exchange rate and text/header-aware fetches"
```

---

### Task 3: US English-only reference prices (PokemonPriceTracker) and ingestion wiring

**Files:**
- Create: `src/providers/ppt/client.ts`, `src/ingest/usPrices.ts`, `drizzle/0004_*.sql`
- Modify: `src/db/schema.ts` (`usReferencePrices`), `src/ingest/run.ts`, `scripts/ingest.ts`, `.env.example`, `test/env-example.test.ts`, `README.md`
- Test: `src/providers/ppt/client.test.ts`, `src/ingest/usPrices.test.ts`, `test/slice.test.tsx` (run report)

**Interfaces:**
- Consumes: `fetchJsonWithHeaders`, `fetchText`, `ingestFxRate`, `ECB_DAILY_URL` (Task 2); `products.tcgplayerId` (Task 1); `benchmarkSnapshots` (existing).
- Produces:

```ts
// ppt/client.ts
export interface PptQuote { usdCents: number | null; dailyRemaining: number | null }
export interface PptClient { cardQuote(tcgPlayerId: number): Promise<PptQuote>; sealedQuote(tcgPlayerId: number): Promise<PptQuote> }
export function createPptClient(opts: { apiKey: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; delayMs?: number /* default 1100 */ }): PptClient
// schema.ts
export const usReferencePrices = pgTable('us_reference_prices', {
  id: serial('id').primaryKey(), productId: integer('product_id').notNull().references(() => products.id),
  capturedAt: ts('captured_at').notNull(), capturedDay: date('captured_day', { mode: 'string' }).notNull(),
  usdCents: integer('usd_cents').notNull(),
}, (t) => [unique('us_reference_prices_product_day_uq').on(t.productId, t.capturedDay)]);
// usPrices.ts
export const US_PRICE_MIN_REMAINING = 10;
export function ingestUsReferencePrices(db: Db, client: PptClient, setKey: string, now: Date):
  Promise<{ fetched: number; alreadyToday: number; noPrice: number; stoppedEarly: boolean }>
// run.ts: IngestionReport gains
fx?: { rateDate: string; inserted: boolean } | { error: string };
usPrices?: Awaited<ReturnType<typeof ingestUsReferencePrices>> | { error: string };
// runIngestion deps gain: fetchText?: (url: string) => Promise<string>; ppt?: PptClient
```

Behaviour:
- `cardQuote` reads `data.prices.market`.
- `sealedQuote` reads `unopenedPrice` from `data`, which may be one object or an array; it takes the entry whose `tcgPlayerId` equals the requested ID.
- USD to cents: `Math.round(usd * 100)`, with null or ≤ 0 becoming null. `dailyRemaining` is `Number(header X-RateLimit-Daily-Remaining)` or null. The client waits `delayMs` before every call after the first.
- `ingestUsReferencePrices` selects products where `setKey` matches, `tcgplayerId` is not null, and kind is `sealed` OR the latest snapshot `trendCents >= 500`. It skips any that already have a row for `capturedDay = now (UTC, YYYY-MM-DD)`. It calls `sealedQuote` or `cardQuote` by kind and inserts a row when `usdCents` is not null (otherwise counts `noPrice`). After each call, if `dailyRemaining !== null && dailyRemaining < US_PRICE_MIN_REMAINING`, it sets `stoppedEarly` and stops.
- `runIngestion`, per set, runs in order: Cardmarket, then providers, then FX (if `deps.fetchText`), then US prices (if `deps.ppt`). Each step is wrapped in its own try/catch and records `{ error }` on failure; nothing throws.
- `scripts/ingest.ts` passes `fetchText: (u) => fetchText(u, {})`. It passes `ppt` only when `POKEMONPRICETRACKER_API_KEY` is set, and otherwise prints `POKEMONPRICETRACKER_API_KEY not set: skipping US prices`. It prints one line each, e.g. `  FX: 1 € = $1.1225 (2026-10-19)` and `  US prices: 87 fetched, 0 already today, 3 without price` (plus ` — stopped early (daily credits low)` when it stopped early).
- `.env.example` gains `POKEMONPRICETRACKER_API_KEY=`, and the env test also asserts it's empty.
- README: add a "US reference prices" paragraph explaining the free key at pokemonpricetracker.com, the variable name, and about 87 credits/day.

- [ ] **Step 1: Write the failing tests**

`src/providers/ppt/client.test.ts`, using a fake `fetchImpl` and a recording `sleep`:

```ts
it('reads a card market price in cents with the remaining credits', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { tcgPlayerId: '716192', prices: { market: 10.3 } } }), { status: 200, headers: { 'X-RateLimit-Daily-Remaining': '93' } }));
  const c = createPptClient({ apiKey: 'k3y', fetchImpl, sleep: async () => {} });
  await expect(c.cardQuote(716192)).resolves.toEqual({ usdCents: 1030, dailyRemaining: 93 });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=716192');
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer k3y');
});
it('reads a sealed unopened price from a list response', async () => {
  const body = { data: [{ tcgPlayerId: '709036', unopenedPrice: 1460.07 }, { tcgPlayerId: '704143', unopenedPrice: 128.86 }] };
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: 200 }));
  await expect(createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).sealedQuote(704143)).resolves.toEqual({ usdCents: 12886, dailyRemaining: null });
});
it('waits between calls', async () => {
  const sleep = vi.fn(async (_ms: number) => {});
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { prices: { market: 1 } } }), { status: 200 }));
  const c = createPptClient({ apiKey: 'k', fetchImpl, sleep });
  await c.cardQuote(1); await c.cardQuote(2);
  expect(sleep).toHaveBeenCalledWith(1100);
});
```

`src/ingest/usPrices.test.ts` (PGlite; seed with `ingestCardmarket(cardmarketFetch())`, then set `tcgplayerId` directly on ETB 895551 (sealed), Mew 909509 (single, trend 316053) and Exeggcute 907607 (single, trend 5)):

```ts
const quote = (usdCents: number | null, dailyRemaining: number | null = 90) => ({ usdCents, dailyRemaining });
it('fetches sealed products and singles worth €5+, once per day', async () => {
  const client = { cardQuote: vi.fn(async () => quote(270000)), sealedQuote: vi.fn(async () => quote(12886)) };
  expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toEqual({ fetched: 2, alreadyToday: 0, noPrice: 0, stoppedEarly: false });
  expect(client.cardQuote).toHaveBeenCalledTimes(1); // Mew only; Exeggcute is under €5
  expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 0, alreadyToday: 2 });
});
it('stops when daily credits run low', async () => {
  const client = { cardQuote: vi.fn(async () => quote(270000, 9)), sealedQuote: vi.fn(async () => quote(12886, 9)) };
  const r = await ingestUsReferencePrices(db, client, SET.key, NOW);
  expect(r).toMatchObject({ fetched: 1, stoppedEarly: true });
  expect(await db.select().from(usReferencePrices)).toHaveLength(1);
});
it('counts products without a US price', async () => {
  const client = { cardQuote: vi.fn(async () => quote(null)), sealedQuote: vi.fn(async () => quote(null)) };
  expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 0, noPrice: 2 });
});
```

`test/slice.test.tsx`, second test: add a `ppt` fake that throws, then assert `report.usPrices` equals `{ error: … }` while `report.cardmarket` still has its counts.

`test/env-example.test.ts`: also assert that `POKEMONPRICETRACKER_API_KEY=` is present and empty.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/providers/ppt src/ingest/usPrices.test.ts test/slice.test.tsx test/env-example.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as specified above, then run `npm run db:generate`** (expect `drizzle/0004_*.sql`). Use zod schemas with `.loose()` for the PokemonPriceTracker responses.

- [ ] **Step 4: Run the tests, typecheck, lint**

Run: `npm test`, `npx tsc --noEmit`, `npx eslint .`
Expected: all pass (+6 new tests), tsc clean, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/providers/ppt src/ingest/usPrices.ts src/ingest/usPrices.test.ts src/ingest/run.ts src/db/schema.ts drizzle scripts/ingest.ts .env.example test/env-example.test.ts test/slice.test.tsx README.md
git commit -m "feat: daily US English-only reference prices from PokemonPriceTracker"
```

---

### Task 4: Section rows query

**Files:**
- Create: `src/deals/sections.ts`
- Test: `src/deals/sections.test.ts`

**Interfaces:**
- Consumes:
  - `assessBenchmark`, `scoreListing`, `markStaleListing`, `DEFAULT_DEAL_SETTINGS` (existing)
  - `products.imageUrl` (Task 1)
  - `usReferencePrices` (Task 3), `fxRates` (Task 2)
- Produces:

```ts
export type SealedType = 'etb' | 'bundles-displays' | 'boosters' | 'collections' | 'tins' | 'blisters' | 'battle-decks' | 'other';
export const SEALED_TYPES: readonly { key: SealedType; label: string; category: string | null }[];
//  in this order: etb 'Elite Trainer Boxes' 'Pokémon Elite Trainer Boxes'; bundles-displays 'Booster Bundles & Displays' 'Pokémon Display';
//  boosters 'Boosters' 'Pokémon Booster'; collections 'Collections & UPCs' 'Pokémon Box Set'; tins 'Tins' 'Pokémon Tins';
//  blisters 'Blisters' 'Pokémon Blisters'; battle-decks 'Battle Decks' 'Pokémon Theme Decks'; other 'Other' null
export function sealedTypeOf(categoryName: string): SealedType
export const SINGLES_MIN_VALUE_CENTS = 500;
export interface SectionOffer { listingId: number; url: string; priceCents: number; language: string; sellerCountry: string | null; score: ScoredListing }
export interface SectionRow {
  productId: number; productName: string; kind: ProductKind; sealedType: SealedType | null; imageUrl: string | null;
  benchmark: BenchmarkAssessment;
  us: { usdCents: number; eurCents: number } | null;
  offer: SectionOffer | null;
  offerCount: number;
}
export function getSectionRows(db: Db, opts: { section: 'singles' | 'sealed'; setKey: string; now: Date;
  settings?: DealSettings; allSingles?: boolean; sealedType?: SealedType }): Promise<SectionRow[]>
export function getSectionCounts(db: Db, setKey: string): Promise<{ singles: number; sealed: number }>
// singles = singles whose latest trend >= SINGLES_MIN_VALUE_CENTS; sealed = all sealed products in the set
```

Rules (spec §4 and §7):
- Offer candidates: listings with `available`, `language in ('en','de')`, `currency = 'EUR'`; for singles also `condition in ('mint','near_mint')`.
- `offer`: the candidate with the lowest `priceCents` (ties broken by lowest listing id). Score it with `scoreListing` on the product's benchmark (`reverseHolo: listing.isReverseHolo`, `kind`), then `markStaleListing`.
- `offerCount`: the number of candidates.
- `benchmark`: `assessBenchmark` on the product's latest snapshot (all-null snapshot when none), with `reverseHolo: false`.
- `us`: taken from the product's newest `usReferencePrices` row and the newest `fxRates` row. It is null when either is missing, when the price's `capturedAt` is older than 7 days before `now`, or when the rate's `rateDate` is older than 7 days before `now`. Otherwise `eurCents = Math.round(usdCents / usdPerEur)`.
- Singles: keep only those with `benchmark.valueCents >= 500` unless `allSingles`. Sort by `benchmark.valueCents` descending (nulls last), then by name.
- Sealed: filter by `sealedType` when given. Sort by `SEALED_TYPES` order, then by value descending (nulls last), then by name.

- [ ] **Step 1: Write the failing tests** (`src/deals/sections.test.ts`, PGlite)

Seed: `ingestCardmarket(cardmarketFetch())`, then listings via `ingestListings` + `fakeProvider` (`makeListing`). Use `NOW = 2026-10-19T12:00:00Z`.

```ts
it('maps Cardmarket categories to sealed types', () => {
  expect(sealedTypeOf('Pokémon Elite Trainer Boxes')).toBe('etb');
  expect(sealedTypeOf('Pokémon Display')).toBe('bundles-displays');
  expect(sealedTypeOf('Pokémon Theme Decks')).toBe('battle-decks');
  expect(sealedTypeOf('Something New')).toBe('other');
});
it('shows the cheapest EN/DE EUR offer and counts only EN/DE offers', async () => {
  await seed({ externalId: 'a', priceCents: 12000, language: 'de' }, { externalId: 'b', priceCents: 9900, language: 'en' },
             { externalId: 'c', priceCents: 5000, language: 'it' });
  const etb = (await getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW })).find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
  expect(etb.offer).toMatchObject({ priceCents: 9900, language: 'en' });
  expect(etb.offerCount).toBe(2);
  expect(etb.offer!.score.isDeal).toBe(true); // 9900 vs 13295 = 26% below
});
it('lists products without an EN/DE offer', async () => {
  const rows = await getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW });
  expect(rows.map((r) => r.productName)).toEqual(['30th Celebration Elite Trainer Box', '30th Celebration: Knock Out Collection', '30th Celebration Poster Collection']);
  expect(rows.every((r) => r.offer === null && r.offerCount === 0)).toBe(true);
});
it('filters sealed by type', async () => {
  const rows = await getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW, sealedType: 'etb' });
  expect(rows.map((r) => r.sealedType)).toEqual(['etb']);
});
it('shows singles worth €5+ by default, sorted by market value', async () => {
  const names = (await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW })).map((r) => r.productId);
  const all = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true });
  expect(names).toHaveLength(2);                 // Mew 909509 (€3,160.53) and Mew 909510 (€2,264.21)
  expect(all).toHaveLength(4);
  expect(all[0].benchmark.valueCents).toBe(316053);
});
it('only uses Near Mint or Mint offers for singles', async () => {
  await seed({ externalId: 's1', cardmarketProductId: 909509, condition: 'slightly_played', priceCents: 100000, language: 'en' },
             { externalId: 's2', cardmarketProductId: 909509, condition: 'near_mint', priceCents: 250000, language: 'en' });
  const mew = (await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW }))[0];
  expect(mew.offer).toMatchObject({ priceCents: 250000 });
  expect(mew.offerCount).toBe(1);
});
it('converts the US price with the newest rate', async () => {
  // insert fx 2026-10-19 = 1.1225 and a US price 12886 for the ETB captured at NOW
  const etb = (await getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW }))[0];
  expect(etb.us).toEqual({ usdCents: 12886, eurCents: 11480 });
});
it('hides US prices older than 7 days', async () => {
  // insert fx 2026-10-19 and a US price captured 8 days before NOW
  expect((await getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW }))[0].us).toBeNull();
});
it('counts singles worth €5+ and all sealed', async () => {
  expect(await getSectionCounts(db, SET.key)).toEqual({ singles: 2, sealed: 3 });
});
```

(Fixture check: the fixture's tracked singles are 907607 (5 ¢), 907672 (23 ¢), 909509 (316053 ¢) and 909510 (226421 ¢), so 2 are worth €5+. The tracked sealed products are ETB, Poster Collection and Knock Out Collection. In type order (`etb` first, then `collections` by value) that gives ETB, Knock Out (3869) and Poster (2992).)

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/deals/sections.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement `src/deals/sections.ts`** as specified. Reuse `toSnapshot` / `emptySnapshot` from `feed.ts`: export them from there instead of copying them.

- [ ] **Step 4: Run the tests, then typecheck**

Run: `npm test`, then `npx tsc --noEmit`
Expected: all pass (+9 new tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/deals/sections.ts src/deals/sections.test.ts src/deals/feed.ts
git commit -m "feat: section rows with cheapest EN/DE offer, market value and US reference"
```

---

### Task 5: Tabs and section tables

**Files:**
- Create: `src/lib/params.ts`, `src/components/SectionTabs.tsx`, `src/components/SectionTable.tsx`
- Modify: `src/app/page.tsx`, `src/components/FeedSkeleton.tsx` (only if needed for the tab bar)
- Test: `src/lib/params.test.ts`, `src/components/SectionTabs.test.tsx`, `src/components/SectionTable.test.tsx`

**Interfaces:**
- Consumes: `SectionRow`, `SEALED_TYPES`, `SealedType`, `getSectionRows`, `getSectionCounts` (Task 4); `CardImage`, `splitProductName`, `formatEuro`, `formatPct` (existing); `DealFeed`, `TopBar`, `StatsRow` (existing).
- Produces:

```ts
// params.ts
export type DashboardTab = 'deals' | 'singles' | 'sealed';
export interface DashboardParams { tab: DashboardTab; allSingles: boolean; sealedType: SealedType | null }
export function parseDashboardParams(sp: Record<string, string | string[] | undefined>): DashboardParams
// SectionTabs.tsx
export function SectionTabs(props: { active: DashboardTab; counts: { deals: number; singles: number; sealed: number } }): JSX.Element
// SectionTable.tsx
export function SectionTable(props: { section: 'singles' | 'sealed'; rows: SectionRow[]; allSingles: boolean; sealedType: SealedType | null }): JSX.Element
```

Exact copy and behaviour:
- Tabs: links `?tab=deals` / `?tab=singles` / `?tab=sealed` labelled `Deals 5`, `Singles 52`, `Sealed 35` (the number goes in its own span). The active tab has `aria-current="page"`. `Slabs · soon` is a non-link `<span aria-disabled="true">`. The tabs sit in a `<nav aria-label="Sections">` and use gold for the active tab, as in the mockup.
- Singles toolbar: chips `Worth €5+` (linking to `?tab=singles`) and `All singles` (linking to `?tab=singles&all=1`), with the active one highlighted. Right side: `Sorted by: market value`.
- Sealed toolbar: chips `All` (linking to `?tab=sealed`), then one chip per `SEALED_TYPES` entry except `other` (linking to `?tab=sealed&type=<key>`).
- Header row: for singles `Card · Market value · US English-only · Cheapest EN/DE (Near Mint) · Difference · Offers`; for sealed `Product · Market value · US English-only · Cheapest EN/DE · Difference · Offers`.
- Row:
  - `CardImage` (alt = product name, width 44 px)
  - the title from `splitProductName`, with the detail (singles) or the sealed type label (sealed) underneath
  - the market value `formatEuro(benchmark.valueCents)`, or `–`
  - the US cell: `€9.18` + ` ($10.30)`, or `–`
  - the offer cell: `formatEuro(priceCents)` + small `EN · PT` (language upper-cased · seller country), or `no EN/DE offer yet`
  - the difference pill: with `d = offer.score.discountPct`, show `−${formatPct(d)}` (green) when `d >= 0`, `+${formatPct(-d)}` (red) when `d < 0`, and `–` when null
  - the offer count
- Glow: a row glows (mint ring) when `offer?.score.isDeal`.
- Row link: a row with an offer is an `<a href={offer.url} target="_blank" rel="noopener noreferrer" aria-label="View {title} on CardTrader">`. A row without an offer is a `<div>`.
- Empty table: `No products in this section yet.`
- `page.tsx`:
  - `export default async function Home({ searchParams }: PageProps<'/'>)` passes `searchParams` into `Feed` (don't await outside Suspense).
  - `Feed` awaits `connection()`, then `parseDashboardParams(await searchParams)`, and loads the deals, stats and section counts.
  - It loads `getSectionRows` only for the active tab (singles/sealed).
  - It renders TopBar, StatsRow, SectionTabs, then the active content: `DealFeed` for deals, otherwise `SectionTable`.

- [ ] **Step 1: Write the failing tests**

`src/lib/params.test.ts`:

```ts
it('reads the tab, the singles switch and the sealed type', () => {
  expect(parseDashboardParams({ tab: 'singles', all: '1' })).toEqual({ tab: 'singles', allSingles: true, sealedType: null });
  expect(parseDashboardParams({ tab: 'sealed', type: 'etb' })).toEqual({ tab: 'sealed', allSingles: false, sealedType: 'etb' });
});
it('falls back to defaults for unknown parameters', () => {
  expect(parseDashboardParams({})).toEqual({ tab: 'deals', allSingles: false, sealedType: null });
  expect(parseDashboardParams({ tab: 'slabs', type: 'nope', all: ['1', '2'] })).toEqual({ tab: 'deals', allSingles: false, sealedType: null });
});
```

`src/components/SectionTabs.test.tsx` (jsdom):

```tsx
it('links the tabs and marks the active one', () => {
  render(<SectionTabs active="sealed" counts={{ deals: 5, singles: 52, sealed: 35 }} />);
  expect(screen.getByRole('link', { name: /Sealed/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /Singles/ })).toHaveAttribute('href', '?tab=singles');
  expect(screen.getByText('52')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Slabs/ })).not.toBeInTheDocument();
  expect(screen.getByText('Slabs · soon')).toHaveAttribute('aria-disabled', 'true');
});
```

`src/components/SectionTable.test.tsx` (jsdom). Use a `row()` fixture: ETB, sealed type `etb`, benchmark 13295 high, US `{ usdCents: 12886, eurCents: 11480 }`, offer 9900 EN · DE with score discountPct 0.2554 isDeal true, offerCount 2, url `https://www.cardtrader.com/cards/399230`.

```tsx
it('shows a sealed row with market value, US reference, offer and difference', () => {
  render(<SectionTable section="sealed" rows={[row()]} allSingles={false} sealedType={null} />);
  for (const t of ['€132.95', '€114.80', '($128.86)', '€99.00', 'EN · DE', '−26%', '2']) expect(screen.getByText(t)).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'View 30th Celebration Elite Trainer Box on CardTrader' });
  expect(link).toHaveAttribute('href', 'https://www.cardtrader.com/cards/399230');
  // "Elite Trainer Boxes" is also a toolbar chip, so look for the subline inside the row
  expect(within(link).getByText('Elite Trainer Boxes')).toBeInTheDocument();
});
it('shows a product without an offer', () => {
  render(<SectionTable section="sealed" rows={[row({ offer: null, offerCount: 0, us: null })]} allSingles={false} sealedType={null} />);
  expect(screen.getByText('no EN/DE offer yet')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /View/ })).not.toBeInTheDocument();
  expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2); // US and difference
});
it('marks offers above market value in red with a plus', () => {
  render(<SectionTable section="sealed" rows={[row({ offer: { ...row().offer!, priceCents: 15000, score: { ...row().offer!.score, discountPct: -0.128, isDeal: false } } })]} allSingles={false} sealedType={null} />);
  expect(screen.getByText('+13%')).toBeInTheDocument();
});
it('shows the singles chips and highlights the active one', () => {
  render(<SectionTable section="singles" rows={[]} allSingles={true} sealedType={null} />);
  expect(screen.getByRole('link', { name: 'All singles' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('link', { name: 'Worth €5+' })).toHaveAttribute('href', '?tab=singles');
  expect(screen.getByText('No products in this section yet.')).toBeInTheDocument();
});
it('shows one chip per sealed type', () => {
  render(<SectionTable section="sealed" rows={[]} allSingles={false} sealedType="etb" />);
  expect(screen.getByRole('link', { name: 'Elite Trainer Boxes' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('link', { name: 'Battle Decks' })).toHaveAttribute('href', '?tab=sealed&type=battle-decks');
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/params.test.ts src/components/SectionTabs.test.tsx src/components/SectionTable.test.tsx`
Expected: FAIL (missing modules).

- [ ] **Step 3: Implement** the components and `page.tsx` as specified. Follow the mockup for proportions, and use the existing tokens. On narrow screens the table may collapse into stacked cards (builder's call), as long as every cell stays readable.

- [ ] **Step 4: Run the tests, typecheck, lint, build**

Run: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `DATABASE_URL= npm run build`
Expected: all pass (+8 new tests), 0 lint errors, build OK, `/` still Partial Prerender.

- [ ] **Step 5: Commit**

```bash
git add src/lib/params.ts src/lib/params.test.ts src/components/SectionTabs.tsx src/components/SectionTabs.test.tsx src/components/SectionTable.tsx src/components/SectionTable.test.tsx src/app/page.tsx src/components/FeedSkeleton.tsx
git commit -m "feat: Deals, Singles, Sealed tabs with section tables"
```

---

## After the tasks (controller, not an implementer)

Run `npm run db:migrate`, then `npm run ingest` (with the real CardTrader and PokemonPriceTracker keys from `.env.local`), and open http://localhost:3000. Check:
- The ETB now shows English/German offers.
- The US column is filled for most rows.
- About 87 PokemonPriceTracker credits were used.
- The tabs and chips work.
