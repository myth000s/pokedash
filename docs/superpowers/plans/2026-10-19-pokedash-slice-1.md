# pokedash Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Cardmarket market values and CardTrader listings for the 30th Celebration set, score every listing, and show the deals on a feed page, running locally.

**Architecture:** Pure scoring functions (`src/scoring`) sit under a thin data layer. Ingestion modules (`src/ingest`) pull from sources through a shared fetch helper and a `ListingProvider` interface (`src/providers`), validate with zod, and write to Postgres via Drizzle. The feed (`src/deals`) joins listings with each product's latest market value and scores them when the page is read. A Next.js server component renders the result.

**Tech Stack:** Node.js 24 LTS, Next.js (App Router, whatever `create-next-app@latest` installs), TypeScript (strict), Tailwind CSS, Drizzle ORM + drizzle-kit, postgres (postgres-js), @electric-sql/pglite (tests), zod, Vitest, @testing-library/react, jsdom, tsx, Supabase CLI (local Postgres in Docker).

**Spec:** `docs/superpowers/specs/2026-10-19-pokedash-design.md`

This plan covers **slice 1 only** (spec §10). Slices 2–6 get their own plans.

## Global Constraints

- Node.js 24 LTS (24.22.0 is installed); npm is the package manager.
- TypeScript `strict: true`. Path alias `@/*` → `src/*`.
- Money is integer euro cents everywhere. Cardmarket euros convert with `Math.round(v * 100)`, and values that are `null`, missing or `<= 0` become `null`.
- Market value comes only from Cardmarket's sales-based fields (`trend`, `avg`, `avg1`, `avg7`, `avg30` and their `-holo` variants). `low` / `low-holo` are asking prices and are never used for valuation.
- Only documented sources: the Cardmarket public download files and CardTrader API v2 with the owner's token. No scraping, no Kleinanzeigen.
- Secrets (`DATABASE_URL`, `CARDTRADER_TOKEN`) are read from env only, never logged, never included in error messages, never imported into client components. `.env.local` stays git-ignored.
- First set: 30th Celebration = Cardmarket `idExpansion` 6601, excluded categories `"Pokémon Coins"` and `"PCG Set"`, CardTrader expansion name prefix `"30th Celebration"`.
- Deal defaults: `minDiscountPct 0.2`, `minBenchmarkCents 500`, `maxBenchmarkAgeHours 48`, `suspiciousDiscountPct 0.6`, `languages ['en','de']`, `dealConditions ['mint','near_mint']`.
- UI copy is English. Prices use `Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })`, e.g. `€3,160.53`.
- Tests: Vitest. Database tests use in-memory PGlite with the real migrations from `drizzle/`. No test touches the network.

## Review Focus

1. **Different products with the same name** (three Cardmarket products named `Mew [Psychic | 30C]`, worth €0.23, €2,264.21 and €3,160.53). A listing must get the market value of the product with its ID, never one picked by name. Tests: Task 4 `keeps same-name products distinct`, Task 6 `picks the right product when names collide`.
2. **A CardTrader offer with no language property** must be skipped with `Missing language`, never stored as English. Test: Task 6 `skips an offer without a language instead of assuming English`.
3. **A provider fails mid-run.** Existing listings must stay available, and the other sources still run. Tests: Task 7 `leaves listings untouched when the provider fails`, Task 10 `keeps going when one provider fails`.
4. **A broken or partial Cardmarket download** must fail before writing, and yesterday's products and snapshots must stay intact. Test: Task 5 `keeps previous data when a download is broken`.
5. **The lowest asking price is never the market value** (the ETB's `low` is €89.90, its `trend` €132.95). Test: Task 1 `never uses the lowest asking price`.

---

### Task 1: Project setup and market-value assessment

**Files:**
- Delete: `README.md` (it only contains `# pokedash`. `create-next-app` refuses to run in a folder that has one, and it writes a new one.)
- Create (scaffold): Next.js app in the repo root
- Create: `vitest.config.mts`, `test/setup.ts`, `.env.example`
- Modify: `.gitignore` (add `!.env.example`)
- Create: `src/domain/types.ts`, `src/config/settings.ts`, `src/scoring/benchmark.ts`
- Test: `src/scoring/benchmark.test.ts`

**Interfaces:**
- Produces (`src/domain/types.ts`):
  ```ts
  export type ProductKind = 'single' | 'sealed';
  export type Marketplace = 'cardtrader' | 'ebay';
  export type Condition = 'mint' | 'near_mint' | 'slightly_played' | 'moderately_played' | 'played' | 'poor';
  export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';
  export interface PriceGuideCents {
    avg: number | null; low: number | null; trend: number | null;
    avg1: number | null; avg7: number | null; avg30: number | null;
    avgHolo: number | null; lowHolo: number | null; trendHolo: number | null;
    avg1Holo: number | null; avg7Holo: number | null; avg30Holo: number | null;
  }
  export interface BenchmarkSnapshot extends PriceGuideCents { capturedAt: Date }
  export interface BenchmarkAssessment {
    valueCents: number | null; basis: 'trend' | 'trend_holo';
    confidence: Confidence; reasons: string[]; capturedAt: Date;
  }
  export interface NormalizedListing {
    marketplace: Marketplace; externalId: string; cardmarketProductId: number;
    title: string; url: string; priceCents: number; currency: string;
    shippingCents: number | null; condition: Condition | null; language: string | null;
    isReverseHolo: boolean; sellerName: string | null; sellerCountry: string | null;
  }
  export interface ScoredListing {
    deliveredCents: number; shippingKnown: boolean;
    discountCents: number | null; discountPct: number | null;
    isDeal: boolean; warnings: string[]; notDealReasons: string[];
  }
  ```
- Produces (`src/config/settings.ts`): `interface DealSettings { minDiscountPct: number; minBenchmarkCents: number; maxBenchmarkAgeHours: number; suspiciousDiscountPct: number; languages: string[]; dealConditions: Condition[] }` and `DEFAULT_DEAL_SETTINGS` with the values from Global Constraints.
- Produces (`src/scoring/benchmark.ts`): `assessBenchmark(snapshot: BenchmarkSnapshot, opts: { kind: ProductKind; reverseHolo: boolean; now: Date; maxAgeHours: number }): BenchmarkAssessment`

- [ ] **Step 1: Scaffold the app and test runner**

```bash
git rm README.md
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
npm install zod drizzle-orm postgres
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @electric-sql/pglite drizzle-kit tsx
```

`vitest.config.mts`: plugins `tsconfigPaths()` and `react()`, `test.environment: 'node'`, `test.setupFiles: ['test/setup.ts']`. `test/setup.ts`: `import '@testing-library/jest-dom/vitest';`. Add the `"test": "vitest run"` script to `package.json`. `.env.example`:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
CARDTRADER_TOKEN=
```

Next's default `.gitignore` ignores `.env*`, so append `!.env.example`.

- [ ] **Step 2: Write the failing test** `src/scoring/benchmark.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { assessBenchmark } from './benchmark';
import type { BenchmarkSnapshot } from '@/domain/types';

const NOW = new Date('2026-10-19T12:00:00Z');
const FRESH = new Date('2026-10-19T00:42:46Z');
const snap = (over: Partial<BenchmarkSnapshot>): BenchmarkSnapshot => ({
  capturedAt: FRESH, avg: null, low: null, trend: null, avg1: null, avg7: null, avg30: null,
  avgHolo: null, lowHolo: null, trendHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null, ...over,
});
const single = { kind: 'single' as const, reverseHolo: false, now: NOW, maxAgeHours: 48 };
const sealed = { ...single, kind: 'sealed' as const };

describe('assessBenchmark', () => {
  it('rates a single with steady recent sales as high confidence', () => {
    expect(assessBenchmark(snap({ trend: 316053, avg7: 306574, avg30: 299938 }), single))
      .toEqual({ valueCents: 316053, basis: 'trend', confidence: 'high', reasons: [], capturedAt: FRESH });
  });
  it('drops to medium when a recent average is missing', () => {
    const a = assessBenchmark(snap({ trend: 316053, avg7: null, avg30: 299938 }), single);
    expect(a.confidence).toBe('medium');
    expect(a.reasons).toEqual(['Few recent sales']);
  });
  it('drops to medium when recent sales vary 25–50% from the trend', () => {
    const a = assessBenchmark(snap({ trend: 10000, avg7: 13000, avg30: 10000 }), single);
    expect(a.confidence).toBe('medium');
    expect(a.reasons).toEqual(['Recent sales vary from the trend']);
  });
  it('drops to low when recent sales differ by more than 50%', () => {
    const a = assessBenchmark(snap({ trend: 10000, avg7: 10000, avg30: 16000 }), single);
    expect(a.confidence).toBe('low');
    expect(a.reasons).toEqual(['Recent sales differ a lot from the trend']);
  });
  it('checks sealed products against the average sell price', () => {
    expect(assessBenchmark(snap({ trend: 13295, avg: 15045 }), sealed).confidence).toBe('high');
    expect(assessBenchmark(snap({ trend: 2992, avg: 3986 }), sealed).confidence).toBe('medium');
  });
  it('reports insufficient data when there is no trend', () => {
    expect(assessBenchmark(snap({ avg: 15045 }), sealed)).toMatchObject({
      valueCents: null, confidence: 'insufficient', reasons: ['No sales-based market price'],
    });
  });
  it('uses reverse-holo prices for reverse-holo cards', () => {
    const a = assessBenchmark(
      snap({ trend: 13, trendHolo: 49, avg7Holo: 36, avg30Holo: 54 }),
      { ...single, reverseHolo: true },
    );
    expect(a).toMatchObject({ valueCents: 49, basis: 'trend_holo', confidence: 'medium' });
  });
  it('steps confidence down when price data is old', () => {
    const old = new Date(NOW.getTime() - 72 * 3_600_000);
    const a = assessBenchmark(snap({ capturedAt: old, trend: 316053, avg7: 306574, avg30: 299938 }), single);
    expect(a.confidence).toBe('medium');
    expect(a.reasons).toEqual(['Price data is 3 days old']);
  });
  it('never uses the lowest asking price', () => {
    const a = assessBenchmark(snap({ trend: 13295, avg: 15045, low: 8990 }), sealed);
    expect(a).toMatchObject({ valueCents: 13295, confidence: 'high' });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/scoring/benchmark.test.ts`
Expected: FAIL, cannot resolve `./benchmark`

- [ ] **Step 4: Write `src/domain/types.ts`, `src/config/settings.ts` and `assessBenchmark` in `src/scoring/benchmark.ts`**

Algorithm (spec §5.1):
```
value  = reverseHolo ? trendHolo : trend;  basis = reverseHolo ? 'trend_holo' : 'trend'
if value is null → { valueCents: null, confidence: 'insufficient', reasons: ['No sales-based market price'] }
checks = single ? [avg7, avg30] (holo variants when reverseHolo) : [avg]
level = high
if any check is null → level = min(level, medium), reason 'Few recent sales'
dev = max(|c - value| / value) over non-null checks
if dev > 0.5       → level = low,                reason 'Recent sales differ a lot from the trend'
else if dev > 0.25 → level = min(level, medium), reason 'Recent sales vary from the trend'
ageHours = (now - capturedAt) / 3_600_000
ageHours > maxAgeHours → step level down once (high→medium→low; low stays low),
                         reason `Price data is ${Math.floor(ageHours / 24)} days old`
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/scoring/benchmark.test.ts`
Expected: PASS (9 tests). Also run `npm run build`. Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold app and assess market-value confidence"
```

---

### Task 2: Listing scoring

**Files:**
- Create: `src/scoring/score.ts`
- Test: `src/scoring/score.test.ts`

**Interfaces:**
- Consumes: `BenchmarkAssessment`, `ScoredListing`, `NormalizedListing`, `ProductKind` (Task 1); `DealSettings`, `DEFAULT_DEAL_SETTINGS` (Task 1)
- Produces: `type ScoreInput = Pick<NormalizedListing, 'priceCents' | 'shippingCents' | 'currency' | 'condition' | 'language'> & { kind: ProductKind }` and `scoreListing(input: ScoreInput, benchmark: BenchmarkAssessment, settings: DealSettings): ScoredListing`

- [ ] **Step 1: Write the failing test** `src/scoring/score.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scoreListing, type ScoreInput } from './score';
import { DEFAULT_DEAL_SETTINGS as S } from '@/config/settings';
import type { BenchmarkAssessment, Confidence } from '@/domain/types';

const bm = (valueCents: number | null, confidence: Confidence = 'high'): BenchmarkAssessment => ({
  valueCents, basis: 'trend', confidence, reasons: [], capturedAt: new Date('2026-10-19T00:42:46Z'),
});
const etb: ScoreInput = { priceCents: 9900, shippingCents: 599, currency: 'EUR', condition: null, language: 'de', kind: 'sealed' };
const mew: ScoreInput = { priceCents: 200000, shippingCents: null, currency: 'EUR', condition: 'near_mint', language: 'en', kind: 'single' };

describe('scoreListing', () => {
  it('flags a sealed product 21% below market value as a deal', () => {
    const s = scoreListing(etb, bm(13295), S);
    expect(s).toMatchObject({ deliveredCents: 10499, shippingKnown: true, discountCents: 2796, isDeal: true, warnings: [], notDealReasons: [] });
    expect(s.discountPct).toBeCloseTo(0.2103, 4);
  });
  it('explains when the discount is too small', () => {
    const s = scoreListing({ ...etb, priceCents: 11000 }, bm(13295), S);
    expect(s.isDeal).toBe(false);
    expect(s.notDealReasons).toEqual(['Only 13% below market value (needs 20%)']);
  });
  it('warns when shipping is unknown and uses the item price alone', () => {
    const s = scoreListing({ ...etb, shippingCents: null }, bm(13295), S);
    expect(s).toMatchObject({ deliveredCents: 9900, shippingKnown: false, isDeal: true, warnings: ['Shipping not included'] });
  });
  it('accepts a near-mint English single', () => {
    const s = scoreListing(mew, bm(316053), S);
    expect(s.isDeal).toBe(true);
    expect(s.discountPct).toBeCloseTo(0.3672, 4);
  });
  it('rejects singles below Near Mint', () => {
    expect(scoreListing({ ...mew, condition: 'slightly_played' }, bm(316053), S).notDealReasons).toEqual(['Condition below Near Mint']);
    expect(scoreListing({ ...mew, condition: null }, bm(316053), S).notDealReasons).toEqual(['Condition unknown']);
  });
  it('rejects languages not on the list', () => {
    expect(scoreListing({ ...mew, language: 'fr' }, bm(316053), S).notDealReasons).toEqual(['Language fr is not on your list']);
    expect(scoreListing({ ...mew, language: null }, bm(316053), S).notDealReasons).toEqual(['Language unknown']);
  });
  it('ignores cheap bulk', () => {
    expect(scoreListing({ ...etb, priceCents: 100, shippingCents: 0 }, bm(450), S).notDealReasons).toContain('Market value under €5');
  });
  it('rejects unreliable or missing market values', () => {
    expect(scoreListing(etb, bm(13295, 'low'), S).notDealReasons).toEqual(['Market value is unreliable']);
    expect(scoreListing(etb, bm(null, 'insufficient'), S)).toMatchObject({
      discountCents: null, discountPct: null, isDeal: false, notDealReasons: ['Not enough sales data'],
    });
  });
  it('warns about suspiciously cheap deals but keeps them', () => {
    const s = scoreListing({ ...etb, priceCents: 4000 }, bm(13295), S);
    expect(s.isDeal).toBe(true);
    expect(s.warnings).toEqual(['Unusually cheap: check the listing carefully']);
  });
  it('rejects listings priced above market value', () => {
    const s = scoreListing({ ...etb, priceCents: 15000 }, bm(13295), S);
    expect(s).toMatchObject({ discountCents: -2304, isDeal: false, notDealReasons: ['Priced above market value'] });
  });
  it('does not score non-EUR prices', () => {
    expect(scoreListing({ ...etb, currency: 'USD' }, bm(13295), S)).toMatchObject({
      discountCents: null, discountPct: null, isDeal: false, notDealReasons: ['Price is not in EUR'],
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/scoring/score.test.ts`
Expected: FAIL, cannot resolve `./score`

- [ ] **Step 3: Implement `scoreListing` in `src/scoring/score.ts`**

`deliveredCents = priceCents + (shippingCents ?? 0)`. Discount is computed only when the currency is EUR and `valueCents` is not null: `discountCents = valueCents - deliveredCents` and `discountPct = discountCents / valueCents` (unrounded). Reasons are checked in this order: confidence (`insufficient` → 'Not enough sales data', `low` → 'Market value is unreliable'), currency, `valueCents < minBenchmarkCents` → `Market value under €${minBenchmarkCents / 100}`, language, condition (singles only), then discount (`< 0` → 'Priced above market value', `< minDiscountPct` → `Only ${Math.round(pct*100)}% below market value (needs ${Math.round(min*100)}%)`). The minimum-value and discount checks only run when a discount could be computed, so an insufficient or non-EUR listing gets exactly one reason. Warnings: 'Shipping not included' when shipping is null, and 'Unusually cheap: check the listing carefully' when `discountPct >= suspiciousDiscountPct`. `isDeal = notDealReasons.length === 0`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/scoring`
Expected: PASS (20 tests)

- [ ] **Step 5: Commit**

```bash
git add src/scoring/score.ts src/scoring/score.test.ts
git commit -m "feat: score listings against market value"
```

---

### Task 3: Fetch helper with retries

**Files:**
- Create: `src/lib/http.ts`
- Test: `src/lib/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class HttpError extends Error { readonly status: number; readonly url: string }
  export interface FetchJsonOptions<T> {
    schema: z.ZodType<T>; headers?: Record<string, string>;
    retries?: number;      // default 3
    baseDelayMs?: number;  // default 500
    fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>;
  }
  export function fetchJson<T>(url: string, opts: FetchJsonOptions<T>): Promise<T>
  ```

- [ ] **Step 1: Write the failing test** `src/lib/http.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, HttpError } from './http';

const res = (status: number, body: unknown = { ok: true }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const schema = z.object({ ok: z.boolean() });
const setup = (...responses: Response[]) => {
  const fetchImpl = vi.fn<typeof fetch>();
  responses.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const sleep = vi.fn(async (_ms: number) => {});
  return { fetchImpl, sleep };
};

describe('fetchJson', () => {
  it('returns the parsed body', async () => {
    const d = setup(res(200));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).resolves.toEqual({ ok: true });
  });
  it('retries a 503 and then succeeds', async () => {
    const d = setup(res(503), res(200));
    await fetchJson('https://x.test/a', { schema, ...d });
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
    expect(d.sleep.mock.calls).toEqual([[500]]);
  });
  it('waits for Retry-After on 429', async () => {
    const d = setup(res(429, {}, { 'Retry-After': '2' }), res(200));
    await fetchJson('https://x.test/a', { schema, ...d });
    expect(d.sleep.mock.calls).toEqual([[2000]]);
  });
  it('does not retry a 404', async () => {
    const d = setup(res(404));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).rejects.toMatchObject({ status: 404 });
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('gives up after the last retry', async () => {
    const d = setup(res(500), res(500), res(500));
    await expect(fetchJson('https://x.test/a', { schema, retries: 2, ...d })).rejects.toBeInstanceOf(HttpError);
    expect(d.fetchImpl).toHaveBeenCalledTimes(3);
    expect(d.sleep.mock.calls).toEqual([[500], [1000]]);
  });
  it('rejects a body that does not match the schema', async () => {
    const d = setup(res(200, { nope: 1 }));
    await expect(fetchJson('https://x.test/a', { schema, ...d })).rejects.toThrow();
  });
  it('never puts the token in the error message', async () => {
    const d = setup(res(401));
    const err = await fetchJson('https://x.test/a', { schema, headers: { Authorization: 'Bearer secret-token' }, ...d }).catch((e) => e);
    expect(String(err.message)).not.toContain('secret-token');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/http.test.ts`
Expected: FAIL, cannot resolve `./http`

- [ ] **Step 3: Implement `fetchJson` and `HttpError` in `src/lib/http.ts`**

Up to `retries + 1` attempts. Retry when `fetchImpl` rejects, on 429, and on status >= 500. The delay is `Retry-After` seconds × 1000 (capped at 30 000 ms) when that header is present, otherwise `baseDelayMs * 2 ** (attempt - 1)`. Any other non-2xx throws `HttpError` straight away, with the message `HTTP ${status} for ${url}`. After the last attempt, throw the last `HttpError` (or rethrow the network error). The body is parsed with `schema.parse`, and a ZodError is not retried. Defaults: `fetchImpl = fetch`, `sleep = ms => new Promise(r => setTimeout(r, ms))`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/http.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/http.ts src/lib/http.test.ts
git commit -m "feat: add fetch helper with retry and backoff"
```

---

### Task 4: Cardmarket file parsing and the tracked set

**Files:**
- Create: `src/config/sets.ts`, `src/providers/cardmarket/parse.ts`
- Create: `test/fixtures/cardmarket/price_guide_6.json`, `test/fixtures/cardmarket/products_singles_6.json`, `test/fixtures/cardmarket/products_nonsingles_6.json`, `test/helpers/fixtures.ts`
- Test: `src/providers/cardmarket/parse.test.ts`

**Interfaces:**
- Consumes: `ProductKind`, `PriceGuideCents` (Task 1)
- Produces (`src/config/sets.ts`):
  ```ts
  export interface TrackedSet { key: string; name: string; cardmarketExpansionIds: number[]; excludedCategories: string[]; cardtraderExpansionPrefix: string }
  export const THIRTIETH_CELEBRATION: TrackedSet = { key: '30th-celebration', name: '30th Celebration', cardmarketExpansionIds: [6601], excludedCategories: ['Pokémon Coins', 'PCG Set'], cardtraderExpansionPrefix: '30th Celebration' };
  export const TRACKED_SETS: TrackedSet[] = [THIRTIETH_CELEBRATION];
  ```
- Produces (`src/providers/cardmarket/parse.ts`):
  ```ts
  export const CARDMARKET_URLS: { priceGuide: string; singles: string; nonSingles: string }  // the three URLs in spec §4
  export interface CatalogProduct { cardmarketId: number; name: string; categoryName: string; expansionId: number; kind: ProductKind }
  export function eurosToCents(v: number | null | undefined): number | null
  export function parseCatalog(json: unknown, kind: ProductKind, set: TrackedSet): CatalogProduct[]
  export function parsePriceGuide(json: unknown): { capturedAt: Date; byProductId: Map<number, PriceGuideCents> }
  ```
- Produces (`test/helpers/fixtures.ts`): `loadJson(relPath: string): unknown`, which reads `test/fixtures/<relPath>`.

- [ ] **Step 1: Create the fixtures** (trimmed from the real 2026-10-19 files)

`test/fixtures/cardmarket/products_singles_6.json`:
```json
{"version":1,"createdAt":"2026-10-19T12:36:50+0200","products":[
{"idProduct":907607,"name":"Exeggcute [Hypnosis]","idCategory":51,"categoryName":"Pokémon Single","idExpansion":6601,"idMetacard":468378,"dateAdded":"2026-09-10 08:33:19"},
{"idProduct":907672,"name":"Mew [Psychic | 30C]","idCategory":51,"categoryName":"Pokémon Single","idExpansion":6601,"idMetacard":465170,"dateAdded":"2026-09-10 09:03:37"},
{"idProduct":909509,"name":"Mew [Psychic | 30C]","idCategory":51,"categoryName":"Pokémon Single","idExpansion":6601,"idMetacard":465170,"dateAdded":"2026-09-15 20:20:26"},
{"idProduct":909510,"name":"Mew [Psychic | 30C]","idCategory":51,"categoryName":"Pokémon Single","idExpansion":6601,"idMetacard":465170,"dateAdded":"2026-09-15 20:23:32"},
{"idProduct":273532,"name":"Weedle [Multiply]","idCategory":51,"categoryName":"Pokémon Single","idExpansion":1585,"idMetacard":340471,"dateAdded":"0000-00-00 00:00:00"}]}
```

`test/fixtures/cardmarket/products_nonsingles_6.json`:
```json
{"version":1,"createdAt":"2026-10-19T12:36:52+0200","products":[
{"idProduct":895551,"name":"30th Celebration Elite Trainer Box","idCategory":1016,"categoryName":"Pokémon Elite Trainer Boxes","idExpansion":6601,"idMetacard":0,"dateAdded":"2026-06-30 16:46:03"},
{"idProduct":895553,"name":"30th Celebration Poster Collection","idCategory":1015,"categoryName":"Pokémon Box Set","idExpansion":6601,"idMetacard":0,"dateAdded":"2026-06-30 16:58:04"},
{"idProduct":895559,"name":"30th Celebration: Knock Out Collection","idCategory":1015,"categoryName":"Pokémon Box Set","idExpansion":6601,"idMetacard":0,"dateAdded":"2026-06-30 17:42:29"},
{"idProduct":890359,"name":"30th Celebration JP Booster","idCategory":52,"categoryName":"Pokémon Booster","idExpansion":6602,"idMetacard":0,"dateAdded":"2026-06-02 11:43:59"},
{"idProduct":271439,"name":"Phantom Forces Booster","idCategory":52,"categoryName":"Pokémon Booster","idExpansion":1521,"idMetacard":0,"dateAdded":"2007-01-01 00:00:00"},
{"idProduct":908414,"name":"30th Celebration: Espeon Coin","idCategory":1017,"categoryName":"Pokémon Coins","idExpansion":6601,"idMetacard":0,"dateAdded":"2026-09-11 12:21:31"},
{"idProduct":909369,"name":"30th Celebration: Main Set","idCategory":1654,"categoryName":"PCG Set","idExpansion":6601,"idMetacard":0,"dateAdded":"2026-09-15 13:02:58"}]}
```

`test/fixtures/cardmarket/price_guide_6.json`:
```json
{"version":1,"createdAt":"2026-10-19T02:42:46+0200","priceGuides":[
{"idProduct":907607,"idCategory":51,"avg":0.1,"low":0.02,"trend":0.05,"avg1":0.05,"avg7":0.06,"avg30":0.08,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":907672,"idCategory":51,"avg":0.6,"low":0.02,"trend":0.23,"avg1":0.26,"avg7":0.33,"avg30":0.44,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":909509,"idCategory":51,"avg":3009.79,"low":2199,"trend":3160.53,"avg1":4100,"avg7":3065.74,"avg30":2999.38,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":909510,"idCategory":51,"avg":2780.5,"low":2000,"trend":2264.21,"avg1":1550,"avg7":2388.11,"avg30":2353.91,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":273532,"idCategory":51,"avg":0.14,"low":0.02,"trend":0.13,"avg1":0.09,"avg7":0.14,"avg30":0.15,"avg-holo":0.4,"low-holo":0.2,"trend-holo":0.49,"avg1-holo":0.45,"avg7-holo":0.36,"avg30-holo":0.54},
{"idProduct":895551,"idCategory":1016,"avg":150.45,"low":89.9,"trend":132.95,"avg1":null,"avg7":null,"avg30":null,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":895553,"idCategory":1015,"avg":39.86,"low":2.5,"trend":29.92,"avg1":null,"avg7":null,"avg30":null,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":895559,"idCategory":1015,"avg":32.02,"low":19.49,"trend":38.69,"avg1":null,"avg7":null,"avg30":null,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":890359,"idCategory":52,"avg":8.08,"low":4,"trend":7.73,"avg1":null,"avg7":null,"avg30":null,"avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":271439,"idCategory":52,"avg":149,"low":150,"trend":279.1,"avg1":null,"avg7":null,"avg30":null,"avg-holo":null,"low-holo":null,"trend-holo":3.93,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null},
{"idProduct":908414,"idCategory":1017,"avg":2.74,"low":2.9,"trend":3.17,"avg1":null,"avg7":null,"avg30":null}]}
```

- [ ] **Step 2: Write the failing test** `src/providers/cardmarket/parse.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseCatalog, parsePriceGuide, eurosToCents } from './parse';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { loadJson } from '../../../test/helpers/fixtures';

describe('Cardmarket parsing', () => {
  it('converts euros to cents and treats 0 as no data', () => {
    expect(eurosToCents(3160.53)).toBe(316053);
    expect(eurosToCents(0.05)).toBe(5);
    expect(eurosToCents(0)).toBeNull();
    expect(eurosToCents(null)).toBeNull();
    expect(eurosToCents(undefined)).toBeNull();
  });
  it('keeps only singles from the tracked expansion', () => {
    const ids = parseCatalog(loadJson('cardmarket/products_singles_6.json'), 'single', SET).map((p) => p.cardmarketId);
    expect(ids).toEqual([907607, 907672, 909509, 909510]);
  });
  it('keeps tracked sealed products and drops other expansions, coins and complete sets', () => {
    const products = parseCatalog(loadJson('cardmarket/products_nonsingles_6.json'), 'sealed', SET);
    expect(products.map((p) => p.cardmarketId)).toEqual([895551, 895553, 895559]);
    expect(products[0]).toEqual({ cardmarketId: 895551, name: '30th Celebration Elite Trainer Box', categoryName: 'Pokémon Elite Trainer Boxes', expansionId: 6601, kind: 'sealed' });
  });
  it('keeps same-name products distinct', () => {
    const mews = parseCatalog(loadJson('cardmarket/products_singles_6.json'), 'single', SET).filter((p) => p.name === 'Mew [Psychic | 30C]');
    expect(mews.map((p) => p.cardmarketId)).toEqual([907672, 909509, 909510]);
  });
  it('reads the price guide date and prices in cents', () => {
    const { capturedAt, byProductId } = parsePriceGuide(loadJson('cardmarket/price_guide_6.json'));
    expect(capturedAt.toISOString()).toBe('2026-10-19T00:42:46.000Z');
    expect(byProductId.get(909509)).toMatchObject({ trend: 316053, avg: 300979, low: 219900, avg1: 410000, avg7: 306574, avg30: 299938, trendHolo: null });
    expect(byProductId.get(895551)).toMatchObject({ trend: 13295, avg: 15045, avg7: null, avg30: null, trendHolo: null });
    expect(byProductId.get(273532)).toMatchObject({ trendHolo: 49, avg7Holo: 36, avg30Holo: 54, lowHolo: 20 });
  });
  it('accepts rows without holo fields', () => {
    expect(parsePriceGuide(loadJson('cardmarket/price_guide_6.json')).byProductId.get(908414))
      .toMatchObject({ trend: 317, avgHolo: null, trendHolo: null });
  });
  it('rejects a file that does not look like a price guide', () => {
    expect(() => parsePriceGuide({})).toThrow();
    expect(() => parseCatalog({ products: 'nope' }, 'single', SET)).toThrow();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/providers/cardmarket/parse.test.ts`
Expected: FAIL, cannot resolve `./parse`

- [ ] **Step 4: Implement `src/config/sets.ts`, `test/helpers/fixtures.ts` and `src/providers/cardmarket/parse.ts`**

Zod schemas for both file shapes. Price-guide keys are optional and nullable (`avg-holo` etc. map to `avgHolo` etc.). `parseCatalog` keeps rows whose `idExpansion` is in `set.cardmarketExpansionIds` and whose `categoryName` is not in `set.excludedCategories`. `createdAt` uses a `+0200` offset without a colon, so insert the colon (`/([+-]\d{2})(\d{2})$/` → `$1:$2`) before `new Date()`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/providers/cardmarket`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/config/sets.ts src/providers/cardmarket test/fixtures/cardmarket test/helpers/fixtures.ts
git commit -m "feat: parse Cardmarket catalogue and price guide"
```

---

### Task 5: Database and Cardmarket ingestion

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `drizzle/` (generated), `test/helpers/db.ts`, `test/helpers/cardmarket.ts`, `src/ingest/cardmarket.ts`
- Modify: `package.json` (scripts `db:generate`, `db:migrate`)
- Test: `src/ingest/cardmarket.test.ts`

**Interfaces:**
- Consumes: `parseCatalog`, `parsePriceGuide`, `CARDMARKET_URLS` (Task 4); `TrackedSet` (Task 4)
- Produces (`src/db/schema.ts`, Drizzle `pg-core`, snake_case column names):

  | table (export) | columns |
  |---|---|
  | `products` | `id` serial pk; `cardmarketId` integer unique not null; `name` text not null; `kind` text not null; `categoryName` text not null; `cardmarketExpansionId` integer not null; `setKey` text not null; `updatedAt` timestamptz not null |
  | `benchmarkSnapshots` | `id` serial pk; `productId` integer not null → products.id; `source` text not null default `'cardmarket_price_guide'`; `capturedAt` timestamptz not null; `avgCents`, `lowCents`, `trendCents`, `avg1Cents`, `avg7Cents`, `avg30Cents`, `avgHoloCents`, `lowHoloCents`, `trendHoloCents`, `avg1HoloCents`, `avg7HoloCents`, `avg30HoloCents` integer nullable; unique (`productId`, `capturedAt`) |
  | `listings` | `id` serial pk; `marketplace` text not null; `externalId` text not null; `productId` integer not null → products.id; `title` text not null; `url` text not null; `priceCents` integer not null; `currency` text not null; `shippingCents` integer nullable; `condition` text nullable; `language` text nullable; `isReverseHolo` boolean not null default false; `sellerName` text nullable; `sellerCountry` text nullable; `available` boolean not null default true; `firstSeenAt` timestamptz not null; `lastSeenAt` timestamptz not null; unique (`marketplace`, `externalId`) |
  | `listingPriceHistory` | `id` serial pk; `listingId` integer not null → listings.id; `priceCents` integer not null; `shippingCents` integer nullable; `observedAt` timestamptz not null |

- Produces (`src/db/client.ts`): `export type Db = PgDatabase<PgQueryResultHKT, typeof schema>`; `createDb(url: string): Db` (postgres-js); `getDb(): Db` (singleton from `process.env.DATABASE_URL`, cached on `globalThis` for dev reloads; throws `'DATABASE_URL is not set'` if missing)
- Produces (`test/helpers/db.ts`): `createTestDb(): Promise<Db>`, an in-memory `PGlite` with `migrate(db, { migrationsFolder: 'drizzle' })` from `drizzle-orm/pglite/migrator`. Casting to `Db` is allowed here and in `createDb` only.
- Produces (`test/helpers/cardmarket.ts`): `cardmarketFetch(overrides?: Partial<Record<'priceGuide' | 'singles' | 'nonSingles', unknown>>): (url: string) => Promise<unknown>`, which serves the Task 4 fixtures by `CARDMARKET_URLS` and throws on any other URL.
- Produces (`src/ingest/cardmarket.ts`): `ingestCardmarket(db: Db, deps: { fetchJson: (url: string) => Promise<unknown> }, set: TrackedSet): Promise<{ products: number; snapshots: number; capturedAt: Date }>`

- [ ] **Step 1: Write the failing test** `src/ingest/cardmarket.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { ingestCardmarket } from './cardmarket';
import { products, benchmarkSnapshots } from '@/db/schema';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { loadJson } from '../../test/helpers/fixtures';

const countOf = async (db: Db, t: PgTable) => (await db.select({ n: count() }).from(t))[0].n;

describe('ingestCardmarket', () => {
  it('stores tracked products and their market values', async () => {
    const db = await createTestDb();
    const r = await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
    expect(r).toMatchObject({ products: 7, snapshots: 7 });
    expect(r.capturedAt.toISOString()).toBe('2026-10-19T00:42:46.000Z');
    const [etb] = await db.select().from(products).where(eq(products.cardmarketId, 895551));
    expect(etb).toMatchObject({ kind: 'sealed', setKey: '30th-celebration' });
    const [snap] = await db.select().from(benchmarkSnapshots).where(eq(benchmarkSnapshots.productId, etb.id));
    expect(snap).toMatchObject({ trendCents: 13295, avgCents: 15045, lowCents: 8990, avg7Cents: null });
  });
  it('is idempotent for the same price guide', async () => {
    const db = await createTestDb();
    await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
    const again = await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
    expect(again.snapshots).toBe(0);
    expect(await countOf(db, benchmarkSnapshots)).toBe(7);
    expect(await countOf(db, products)).toBe(7);
  });
  it('adds a new snapshot for a new price guide day', async () => {
    const db = await createTestDb();
    await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
    const nextDay = { ...(loadJson('cardmarket/price_guide_6.json') as object), createdAt: '2026-10-20T02:40:00+0200' };
    await ingestCardmarket(db, { fetchJson: cardmarketFetch({ priceGuide: nextDay }) }, SET);
    expect(await countOf(db, benchmarkSnapshots)).toBe(14);
  });
  it('keeps previous data when a download is broken', async () => {
    const db = await createTestDb();
    await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
    await expect(ingestCardmarket(db, { fetchJson: cardmarketFetch({ priceGuide: {} }) }, SET)).rejects.toThrow();
    await expect(ingestCardmarket(db, { fetchJson: cardmarketFetch({ singles: { products: [] } }) }, SET)).rejects.toThrow();
    expect(await countOf(db, benchmarkSnapshots)).toBe(7);
    expect(await countOf(db, products)).toBe(7);
  });
});
```

The second broken case (`{ products: [] }` missing `version`/`createdAt`) only rejects if the catalogue schema requires those keys, so it must require them.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/ingest/cardmarket.test.ts`
Expected: FAIL, cannot resolve `./cardmarket` / `@/db/schema`

- [ ] **Step 3: Write the schema, generate the migration, write the clients and helpers**

`drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/db/schema.ts'`, `out: './drizzle'`, `dbCredentials.url: process.env.DATABASE_URL ?? ''` (`generate` doesn't connect). Scripts: `"db:generate": "drizzle-kit generate"` and `"db:migrate": "tsx --env-file=.env.local scripts/migrate.ts"` (the script itself comes in Task 10). Run `npm run db:generate`. Expected: one SQL file in `drizzle/`.

- [ ] **Step 4: Implement `ingestCardmarket` in `src/ingest/cardmarket.ts`**

Download all three files first, then parse all three. Nothing is written if either step throws. Then, in one transaction: upsert products on `cardmarketId` (update `name`, `kind`, `categoryName`, `cardmarketExpansionId`, `setKey`, `updatedAt`), and insert one snapshot per tracked product that has a price-guide row, using `onConflictDoNothing` on (`productId`, `capturedAt`). Return the number of products upserted and snapshots actually inserted (`.returning()` length).

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/ingest/cardmarket.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add drizzle drizzle.config.ts package.json package-lock.json src/db src/ingest/cardmarket.ts src/ingest/cardmarket.test.ts test/helpers
git commit -m "feat: store Cardmarket products and daily market values"
```

---

### Task 6: CardTrader listing provider

**Files:**
- Create: `src/providers/types.ts`, `src/providers/cardtrader/schema.ts`, `src/providers/cardtrader/client.ts`, `src/providers/cardtrader/normalize.ts`, `src/providers/cardtrader/provider.ts`, `test/fixtures/cardtrader.ts`, `scripts/cardtrader-smoke.ts`
- Modify: `package.json` (script `cardtrader:smoke`)
- Test: `src/providers/cardtrader/normalize.test.ts`, `src/providers/cardtrader/provider.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 3); `NormalizedListing`, `Condition`, `Marketplace` (Task 1); `TrackedSet` (Task 4)
- Produces (`src/providers/types.ts`):
  ```ts
  export interface ProviderResult { listings: NormalizedListing[]; skipped: { externalId: string; reason: string }[] }
  export interface ListingProvider {
    readonly marketplace: Marketplace;
    fetchListings(set: TrackedSet, trackedCardmarketIds: ReadonlySet<number>): Promise<ProviderResult>;
  }
  ```
- Produces (`src/providers/cardtrader/schema.ts`): zod schemas and inferred types `CtExpansion { id: number; game_id: number; code: string; name: string }`, `CtBlueprint { id: number; name: string; expansion_id: number; card_market_ids: number[] (default []) }`, `CtProduct { id: number; blueprint_id: number; name_en: string; quantity: number; price: { cents: number; currency: string }; properties_hash: Record<string, string | number | boolean | null>; user: { username: string; country_code: string | null }; graded?: boolean | null; on_vacation?: boolean | null; bundle_size?: number | null }` (all `.passthrough()`), and the constants `CT_LANGUAGE_KEY = 'pokemon_language'`, `CT_REVERSE_KEY = 'pokemon_reverse'`, `CT_CONDITIONS: Record<string, Condition>` (`'Mint'→'mint'`, `'Near Mint'→'near_mint'`, `'Slightly Played'→'slightly_played'`, `'Moderately Played'→'moderately_played'`, `'Played'→'played'`, `'Poor'→'poor'`)
- Produces (`src/providers/cardtrader/client.ts`):
  ```ts
  export interface CardTraderClient {
    expansions(): Promise<CtExpansion[]>;
    blueprints(expansionId: number): Promise<CtBlueprint[]>;
    marketplaceProducts(expansionId: number): Promise<Record<string, CtProduct[]>>;
  }
  export function createCardTraderClient(opts: { token: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): CardTraderClient
  ```
  Base `https://api.cardtrader.com/api/v2`. Endpoints: `GET /expansions`, `GET /blueprints/export?expansion_id=<id>`, `GET /marketplace/products?expansion_id=<id>`. Header `Authorization: Bearer <token>`. Waits 120 ms before each marketplace call (≤ 10/s).
- Produces (`src/providers/cardtrader/normalize.ts`): `normalizeCtProduct(p: CtProduct, blueprint: CtBlueprint | undefined, tracked: ReadonlySet<number>): { listing: NormalizedListing } | { skip: string }`
- Produces (`src/providers/cardtrader/provider.ts`): `createCardTraderProvider(client: CardTraderClient): ListingProvider` (marketplace `'cardtrader'`)
- Produces (`test/fixtures/cardtrader.ts`): `ctBlueprint(over?: Partial<CtBlueprint>): CtBlueprint` (default `{ id: 1001, name: 'Mew', expansion_id: 501, card_market_ids: [909509] }`) and `ctProduct(over?: Partial<CtProduct>): CtProduct` (default `{ id: 777, blueprint_id: 1001, name_en: 'Mew', quantity: 1, price: { cents: 200000, currency: 'EUR' }, properties_hash: { condition: 'Near Mint', pokemon_language: 'en', pokemon_reverse: false }, user: { username: 'seller1', country_code: 'DE' }, graded: false, on_vacation: false, bundle_size: 1 }`)

- [ ] **Step 1: Write the failing tests**

`src/providers/cardtrader/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeCtProduct } from './normalize';
import { ctBlueprint, ctProduct } from '../../../test/fixtures/cardtrader';

const tracked = new Set([907672, 909509, 909510, 895551]);

describe('normalizeCtProduct', () => {
  it('maps a near-mint English card to its Cardmarket product', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint(), tracked)).toEqual({ listing: {
      marketplace: 'cardtrader', externalId: '777', cardmarketProductId: 909509, title: 'Mew',
      url: 'https://www.cardtrader.com/cards/1001', priceCents: 200000, currency: 'EUR', shippingCents: null,
      condition: 'near_mint', language: 'en', isReverseHolo: false, sellerName: 'seller1', sellerCountry: 'DE',
    } });
  });
  it('picks the right product when names collide', () => {
    const r = normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909510] }), tracked);
    expect(r).toMatchObject({ listing: { cardmarketProductId: 909510 } });
  });
  it('uses the one tracked id when a blueprint lists several', () => {
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [123, 909509] }), tracked))
      .toMatchObject({ listing: { cardmarketProductId: 909509 } });
  });
  it('skips offers it cannot match exactly', () => {
    expect(normalizeCtProduct(ctProduct(), undefined, tracked)).toEqual({ skip: 'Unknown blueprint' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [] }), tracked)).toEqual({ skip: 'No Cardmarket match' });
    expect(normalizeCtProduct(ctProduct(), ctBlueprint({ card_market_ids: [909509, 909510] }), tracked)).toEqual({ skip: 'Ambiguous Cardmarket match' });
  });
  it('skips an offer without a language instead of assuming English', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint' } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked)).toEqual({ skip: 'Missing language' });
  });
  it('skips graded cards, sellers on vacation, bundles and empty stock', () => {
    expect(normalizeCtProduct(ctProduct({ graded: true }), ctBlueprint(), tracked)).toEqual({ skip: 'Graded card' });
    expect(normalizeCtProduct(ctProduct({ on_vacation: true }), ctBlueprint(), tracked)).toEqual({ skip: 'Seller on vacation' });
    expect(normalizeCtProduct(ctProduct({ bundle_size: 4 }), ctBlueprint(), tracked)).toEqual({ skip: 'Sold as a bundle' });
    expect(normalizeCtProduct(ctProduct({ quantity: 0 }), ctBlueprint(), tracked)).toEqual({ skip: 'Out of stock' });
  });
  it('gives sealed products without a condition a null condition', () => {
    const p = ctProduct({ properties_hash: { pokemon_language: 'de' } });
    expect(normalizeCtProduct(p, ctBlueprint({ card_market_ids: [895551] }), tracked))
      .toMatchObject({ listing: { condition: null, language: 'de', cardmarketProductId: 895551 } });
  });
  it('reads the reverse-holo flag', () => {
    const p = ctProduct({ properties_hash: { condition: 'Near Mint', pokemon_language: 'en', pokemon_reverse: true } });
    expect(normalizeCtProduct(p, ctBlueprint(), tracked)).toMatchObject({ listing: { isReverseHolo: true } });
  });
});
```

`src/providers/cardtrader/provider.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createCardTraderProvider } from './provider';
import { createCardTraderClient, type CardTraderClient } from './client';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { ctBlueprint, ctProduct } from '../../../test/fixtures/cardtrader';

const fakeClient = (): CardTraderClient => ({
  expansions: vi.fn(async () => [
    { id: 501, game_id: 5, code: 'a', name: '30th Celebration' },
    { id: 502, game_id: 5, code: 'b', name: '30th Celebration: Classic Collection' },
    { id: 900, game_id: 5, code: 'c', name: 'Surging Sparks' },
  ]),
  blueprints: vi.fn(async (id: number) => (id === 501 ? [ctBlueprint()] : [ctBlueprint({ id: 2002, card_market_ids: [909510] })])),
  marketplaceProducts: vi.fn(async (id: number) => (id === 501
    ? { '1001': [ctProduct(), ctProduct({ id: 778, graded: true })] }
    : { '2002': [ctProduct({ id: 779, blueprint_id: 2002 })] })),
});

describe('CardTrader provider', () => {
  it('collects listings from every matching expansion only', async () => {
    const client = fakeClient();
    const r = await createCardTraderProvider(client).fetchListings(SET, new Set([909509, 909510]));
    expect(client.blueprints).toHaveBeenCalledTimes(2);
    expect(client.marketplaceProducts).not.toHaveBeenCalledWith(900);
    expect(r.listings.map((l) => [l.externalId, l.cardmarketProductId])).toEqual([['777', 909509], ['779', 909510]]);
    expect(r.skipped).toEqual([{ externalId: '778', reason: 'Graded card' }]);
  });
  it('fails when no expansion matches the set', async () => {
    const client = { ...fakeClient(), expansions: vi.fn(async () => []) };
    await expect(createCardTraderProvider(client).fetchListings(SET, new Set()))
      .rejects.toThrow('No CardTrader expansion matches "30th Celebration"');
  });
  it('calls the marketplace endpoint with the bearer token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({}), { status: 200 }));
    await createCardTraderClient({ token: 't0k', fetchImpl, sleep: async () => {} }).marketplaceProducts(501);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cardtrader.com/api/v2/marketplace/products?expansion_id=501');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer t0k');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/providers/cardtrader`
Expected: FAIL, cannot resolve `./normalize` / `./provider`

- [ ] **Step 3: Implement schema, client, normalize and provider**

Skip checks in `normalizeCtProduct`, in order: unknown blueprint → tracked-ID match (exactly one of `card_market_ids` in `tracked`) → graded → on vacation → `(bundle_size ?? 1) !== 1` → `quantity < 1` → language (not a string → 'Missing language', otherwise lower-cased). Condition is `CT_CONDITIONS[properties_hash.condition] ?? null`. `isReverseHolo` is `properties_hash[CT_REVERSE_KEY] === true`. Shipping is always `null`, because the API doesn't return it. The provider keeps expansions whose `name` starts with `set.cardtraderExpansionPrefix` and handles them in ID order. It looks up each product's blueprint by `blueprint_id`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/providers/cardtrader`
Expected: PASS (11 tests)

- [ ] **Step 5: Write `scripts/cardtrader-smoke.ts`** and add the script `"cardtrader:smoke": "tsx --env-file=.env.local scripts/cardtrader-smoke.ts"`

The script reads `CARDTRADER_TOKEN` and exits with a message if it's missing. It runs the real client for every matching expansion and prints: the matching expansion names and IDs, the blueprint count, how many blueprints have `card_market_ids`, every distinct `properties_hash` key with up to five example values, and normalized/skipped counts by reason (using the Cardmarket IDs from the database if `DATABASE_URL` is set, otherwise all IDs count as tracked). It never prints the token.

- [ ] **Step 6: Run the smoke check against the real API**

Needs `CARDTRADER_TOKEN` in `.env.local`. **If it's missing, stop and ask the owner for it.**
Run: `npm run cardtrader:smoke`
Expected: at least one matching expansion; `card_market_ids` present on most blueprints; language and reverse-holo keys listed. If the real keys differ from `pokemon_language` / `pokemon_reverse`, or condition values differ from `CT_CONDITIONS`, update the constants and the `ctProduct` default, rerun Step 4, and note the change in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/providers package.json test/fixtures/cardtrader.ts scripts/cardtrader-smoke.ts
git commit -m "feat: add CardTrader listing provider"
```

---

### Task 7: Listing ingestion

**Files:**
- Create: `src/ingest/listings.ts`, `test/fixtures/listings.ts`, `test/helpers/fake-provider.ts`
- Test: `src/ingest/listings.test.ts`

**Interfaces:**
- Consumes: `Db`, `listings`, `listingPriceHistory`, `products` (Task 5); `ListingProvider` (Task 6); `TrackedSet` (Task 4); `ingestCardmarket`, `cardmarketFetch` (Task 5, to seed products in tests)
- Produces: `ingestListings(db: Db, provider: ListingProvider, set: TrackedSet, now: Date): Promise<{ upserted: number; skipped: number; markedUnavailable: number; skipReasons: Record<string, number> }>`
- Produces (`test/fixtures/listings.ts`): `makeListing(over?: Partial<NormalizedListing>): NormalizedListing` (default `{ marketplace: 'cardtrader', externalId: 'ct-1', cardmarketProductId: 895551, title: '30th Celebration Elite Trainer Box', url: 'https://www.cardtrader.com/cards/1001', priceCents: 9900, currency: 'EUR', shippingCents: null, condition: null, language: 'de', isReverseHolo: false, sellerName: 'seller1', sellerCountry: 'DE' }`)
- Produces (`test/helpers/fake-provider.ts`): `fakeProvider(marketplace: Marketplace, result: NormalizedListing[] | Error): ListingProvider` (rejects with the Error, otherwise `{ listings: result, skipped: [] }`)

- [ ] **Step 1: Write the failing test** `src/ingest/listings.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestListings } from './listings';
import { ingestCardmarket } from './cardmarket';
import { listings, listingPriceHistory } from '@/db/schema';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { fakeProvider } from '../../test/helpers/fake-provider';
import { makeListing } from '../../test/fixtures/listings';

const T1 = new Date('2026-10-19T12:00:00Z');
const T2 = new Date('2026-10-19T12:15:00Z');
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
});

describe('ingestListings', () => {
  it('stores a new listing with its first price', async () => {
    const r = await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T1);
    expect(r).toMatchObject({ upserted: 1, markedUnavailable: 0 });
    const [row] = await db.select().from(listings);
    expect(row).toMatchObject({ externalId: 'ct-1', priceCents: 9900, available: true, firstSeenAt: T1, lastSeenAt: T1 });
    expect(await db.select().from(listingPriceHistory)).toHaveLength(1);
  });
  it('does not duplicate a listing seen twice', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T1);
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T2);
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstSeenAt: T1, lastSeenAt: T2 });
    expect(await db.select().from(listingPriceHistory)).toHaveLength(1);
  });
  it('records a price change in the history', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T1);
    await ingestListings(db, fakeProvider('cardtrader', [makeListing({ priceCents: 9000 })]), SET, T2);
    const history = await db.select().from(listingPriceHistory).orderBy(listingPriceHistory.id);
    expect(history.map((h) => h.priceCents)).toEqual([9900, 9000]);
    expect((await db.select().from(listings))[0].priceCents).toBe(9000);
  });
  it('marks listings missing from the latest run as unavailable', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing(), makeListing({ externalId: 'ct-2' })]), SET, T1);
    const r = await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T2);
    expect(r.markedUnavailable).toBe(1);
    const [gone] = await db.select().from(listings).where(eq(listings.externalId, 'ct-2'));
    expect(gone.available).toBe(false);
  });
  it('leaves listings untouched when the provider fails', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T1);
    await expect(ingestListings(db, fakeProvider('cardtrader', new Error('boom')), SET, T2)).rejects.toThrow('boom');
    expect((await db.select().from(listings))[0]).toMatchObject({ available: true, lastSeenAt: T1 });
  });
  it('does not touch other marketplaces', async () => {
    await ingestListings(db, fakeProvider('ebay', [makeListing({ marketplace: 'ebay', externalId: 'e-1' })]), SET, T1);
    await ingestListings(db, fakeProvider('cardtrader', []), SET, T2);
    expect((await db.select().from(listings))[0].available).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/ingest/listings.test.ts`
Expected: FAIL, cannot resolve `./listings`

- [ ] **Step 3: Implement `ingestListings` in `src/ingest/listings.ts`**

1. Load `cardmarketId → product.id` for `products.setKey = set.key`.
2. Call `provider.fetchListings(set, new Set(keys))`. If it throws, rethrow before any write.
3. Load the existing rows for this marketplace (`externalId → { id, priceCents, shippingCents }`).
4. In one transaction, upsert each listing on (`marketplace`, `externalId`) with `available = true` and `lastSeenAt = now`. `firstSeenAt = now` is set on insert only. Insert a `listingPriceHistory` row when the listing is new or its price or shipping changed. A listing whose product isn't tracked counts as skipped with the reason 'Untracked product'.
5. Set `available = false` where the marketplace matches, `productId` is in this set's products, `available = true` and `lastSeenAt < now`.

`skipped`/`skipReasons` include the provider's `skipped` entries.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/ingest/listings.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ingest/listings.ts src/ingest/listings.test.ts test/fixtures/listings.ts test/helpers/fake-provider.ts
git commit -m "feat: ingest listings with dedup, price history and availability"
```

---

### Task 8: Deal feed query

**Files:**
- Create: `src/deals/feed.ts`
- Test: `src/deals/feed.test.ts`

**Interfaces:**
- Consumes: `assessBenchmark` (Task 1), `scoreListing` (Task 2), `DEFAULT_DEAL_SETTINGS` (Task 1), schema + `Db` (Task 5)
- Produces:
  ```ts
  export interface DealView {
    listingId: number; productName: string; kind: ProductKind; marketplace: Marketplace; url: string;
    condition: Condition | null; language: string | null; isReverseHolo: boolean;
    priceCents: number; shippingCents: number | null; currency: string; lastSeenAt: Date;
    benchmark: BenchmarkAssessment; score: ScoredListing;
  }
  export function getDealFeed(db: Db, opts: { now: Date; settings?: DealSettings; includeNonDeals?: boolean }): Promise<DealView[]>
  export function getLastCheckedAt(db: Db): Promise<Date | null>   // max(listings.lastSeenAt)
  ```

- [ ] **Step 1: Write the failing test** `src/deals/feed.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDealFeed, getLastCheckedAt } from './feed';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { fakeProvider } from '../../test/helpers/fake-provider';
import { makeListing } from '../../test/fixtures/listings';
import { loadJson } from '../../test/helpers/fixtures';

const NOW = new Date('2026-10-19T12:00:00Z');
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
});
const seed = (...ls: Parameters<typeof makeListing>[0][]) =>
  ingestListings(db, fakeProvider('cardtrader', ls.map((l) => makeListing(l))), SET, NOW);

describe('getDealFeed', () => {
  it('returns a scored deal with market value and discount', async () => {
    await seed({});
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({ productName: '30th Celebration Elite Trainer Box', kind: 'sealed', priceCents: 9900 });
    expect(deal.benchmark).toMatchObject({ valueCents: 13295, confidence: 'high' });
    expect(deal.score).toMatchObject({ isDeal: true, discountCents: 3395, warnings: ['Shipping not included'] });
  });
  it('uses the latest market value', async () => {
    // An older day's guide, ingested *after* today's, with a very different ETB trend (€200).
    const guide = loadJson('cardmarket/price_guide_6.json') as { createdAt: string; priceGuides: { idProduct: number; trend: number | null }[] };
    const older = {
      ...guide,
      createdAt: '2026-10-18T02:40:00+0200',
      priceGuides: guide.priceGuides.map((g) => (g.idProduct === 895551 ? { ...g, trend: 200 } : g)),
    };
    await ingestCardmarket(db, { fetchJson: cardmarketFetch({ priceGuide: older }) }, SET);
    await seed({});
    expect((await getDealFeed(db, { now: NOW }))[0].benchmark.valueCents).toBe(13295);
  });
  it('hides non-deals unless asked', async () => {
    await seed({ priceCents: 12900 });
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
    const [all] = await getDealFeed(db, { now: NOW, includeNonDeals: true });
    expect(all.score.notDealReasons).toEqual(['Only 3% below market value (needs 20%)']);
  });
  it('excludes unavailable listings', async () => {
    await seed({});
    await ingestListings(db, fakeProvider('cardtrader', []), SET, new Date('2026-10-19T12:15:00Z'));
    expect(await getDealFeed(db, { now: NOW, includeNonDeals: true })).toEqual([]);
  });
  it('sorts by discount, biggest first', async () => {
    await seed({}, { externalId: 'ct-ko', cardmarketProductId: 895559, title: 'Knock Out', priceCents: 2500 });
    const feed = await getDealFeed(db, { now: NOW });
    expect(feed.map((d) => d.productName)).toEqual(['30th Celebration: Knock Out Collection', '30th Celebration Elite Trainer Box']);
  });
  it('reports when listings were last checked', async () => {
    expect(await getLastCheckedAt(db)).toBeNull();
    await seed({});
    expect(await getLastCheckedAt(db)).toEqual(NOW);
  });
});
```

(The Knock Out Collection's trend is 3869 and its avg 3202, so it's high confidence. At €25.00 it's 35% below; the ETB is 26% below.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/deals/feed.test.ts`
Expected: FAIL, cannot resolve `./feed`

- [ ] **Step 3: Implement `getDealFeed` and `getLastCheckedAt` in `src/deals/feed.ts`**

Select the available listings joined to products, plus the latest snapshot per product (`DISTINCT ON (product_id) … ORDER BY product_id, captured_at DESC`, as a subquery or a second query keyed by product ID). Map snapshot columns to `BenchmarkSnapshot`. A product with no snapshot gets all-null prices with `capturedAt = now`, which comes out as `insufficient`. Call `assessBenchmark` (`reverseHolo = listing.isReverseHolo`, `maxAgeHours` from settings), then `scoreListing`. Filter on `score.isDeal` unless `includeNonDeals`. Sort by `discountPct` descending (null last), then `lastSeenAt` descending.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/deals/feed.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/deals
git commit -m "feat: build the scored deal feed"
```

---

### Task 9: Deal feed page

**Files:**
- Create: `src/lib/format.ts`, `src/components/DealFeed.tsx`
- Modify: `src/app/page.tsx` (replace the scaffold page), `src/app/layout.tsx` (title `pokedash`)
- Test: `src/lib/format.test.ts`, `src/components/DealFeed.test.tsx`

**Interfaces:**
- Consumes: `DealView`, `getDealFeed`, `getLastCheckedAt` (Task 8); `getDb` (Task 5)
- Produces (`src/lib/format.ts`): `formatEuro(cents: number): string`, `formatPct(fraction: number): string` (rounded whole percent, e.g. `'26%'`), `formatAge(then: Date, now: Date): string` (`'just now'` under 1 min, `'5 min ago'`, `'3 h ago'`, `'2 days ago'`)
- Produces (`src/components/DealFeed.tsx`): `DealFeed(props: { deals: DealView[]; now: Date; lastCheckedAt: Date | null }): JSX.Element`

Card copy, top to bottom: product name (heading); badges `Single`/`Sealed`, `CardTrader`/`eBay`, language upper-cased (`DE`), condition label (`Mint`, `Near Mint`, `Slightly Played`, `Moderately Played`, `Played`, `Poor`; none when null), `Reverse Holo`; the price; `+ €5.99 shipping` or `Shipping not included`; `Market value €132.95` with a badge `High confidence`/`Medium confidence`; `€33.95 below market (26%)`; `Market value updated 11 h ago · Listing seen just now`; each warning except 'Shipping not included' (already shown); a link `View listing` (`target="_blank"`, `rel="noopener noreferrer"`); small text `Based on Cardmarket trend (sales)`. The tests use `getByText`, so each quoted string must be the whole text of a single element. Don't split `Market value €132.95` across child elements. Empty state: `No deals right now.` followed by `Last checked 5 min ago` or `No listings have been checked yet.` Mobile-first single column, two columns from `md`.

- [ ] **Step 1: Write the failing tests**

`src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatEuro, formatPct, formatAge } from './format';

const now = new Date('2026-10-19T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
describe('format', () => {
  it('formats euros', () => {
    expect(formatEuro(10499)).toBe('€104.99');
    expect(formatEuro(316053)).toBe('€3,160.53');
  });
  it('formats percentages', () => expect(formatPct(0.2554)).toBe('26%'));
  it('formats ages', () => {
    expect(formatAge(ago(20_000), now)).toBe('just now');
    expect(formatAge(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatAge(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatAge(ago(50 * 3_600_000), now)).toBe('2 days ago');
  });
});
```

`src/components/DealFeed.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DealFeed } from './DealFeed';
import type { DealView } from '@/deals/feed';

const NOW = new Date('2026-10-19T12:00:00Z');
const deal = (over: Partial<DealView> = {}): DealView => ({
  listingId: 1, productName: '30th Celebration Elite Trainer Box', kind: 'sealed', marketplace: 'cardtrader',
  url: 'https://www.cardtrader.com/cards/1001', condition: null, language: 'de', isReverseHolo: false,
  priceCents: 9900, shippingCents: null, currency: 'EUR', lastSeenAt: NOW,
  benchmark: { valueCents: 13295, basis: 'trend', confidence: 'high', reasons: [], capturedAt: new Date('2026-10-19T00:42:46Z') },
  score: { deliveredCents: 9900, shippingKnown: false, discountCents: 3395, discountPct: 0.2554, isDeal: true, warnings: ['Shipping not included'], notDealReasons: [] },
  ...over,
});

describe('DealFeed', () => {
  it('shows a deal with price, market value, discount and link', () => {
    render(<DealFeed deals={[deal()]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByRole('heading', { name: '30th Celebration Elite Trainer Box' })).toBeInTheDocument();
    for (const text of ['Sealed', 'CardTrader', 'DE', '€99.00', 'Shipping not included', 'Market value €132.95', 'High confidence', '€33.95 below market (26%)']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/1001');
  });
  it('shows known shipping', () => {
    render(<DealFeed deals={[deal({ shippingCents: 599 })]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('+ €5.99 shipping')).toBeInTheDocument();
  });
  it('shows the warning for unusually cheap listings', () => {
    const d = deal({ score: { ...deal().score, warnings: ['Shipping not included', 'Unusually cheap: check the listing carefully'] } });
    render(<DealFeed deals={[d]} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByText('Unusually cheap: check the listing carefully')).toBeInTheDocument();
  });
  it('shows an empty state with the last check time', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={new Date(NOW.getTime() - 5 * 60_000)} />);
    expect(screen.getByText('No deals right now.')).toBeInTheDocument();
    expect(screen.getByText('Last checked 5 min ago')).toBeInTheDocument();
  });
  it('says when nothing has been checked yet', () => {
    render(<DealFeed deals={[]} now={NOW} lastCheckedAt={null} />);
    expect(screen.getByText('No listings have been checked yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/format.test.ts src/components`
Expected: FAIL, cannot resolve `./format` / `./DealFeed`

- [ ] **Step 3: Implement `format.ts` and `DealFeed.tsx`**, then replace `src/app/page.tsx`

`page.tsx` is an async server component rendered per request (`export const dynamic = 'force-dynamic'`, or `await connection()` from `next/server` if the installed Next.js version prefers that). It gets `now = new Date()` and `db = getDb()`, calls `getDealFeed(db, { now })` and `getLastCheckedAt(db)`, and renders the header `pokedash` with the subtitle `30th Celebration deals` above `<DealFeed …/>`. `DealFeed` is a plain (server-compatible) component: no `'use client'`, no hooks.

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run src/lib src/components`
Expected: PASS (15 tests: 8 here plus Task 3's 7 in `src/lib`)
Run: `npm run build`
Expected: succeeds. It must not need `DATABASE_URL` at build time, which is why the page is dynamic.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/components src/app
git commit -m "feat: show scored deals on the home page"
```

---

### Task 10: Ingestion command, end-to-end test, local run

**Files:**
- Create: `src/ingest/run.ts`, `scripts/ingest.ts`, `scripts/migrate.ts`, `test/slice.test.tsx`
- Modify: `package.json` (script `ingest`), `README.md` (how to run)
- Create (generated): `supabase/` via `npx supabase init`

**Interfaces:**
- Consumes: `ingestCardmarket` (Task 5), `ingestListings` (Task 7), `createCardTraderProvider`, `createCardTraderClient` (Task 6), `fetchJson` (Task 3), `getDealFeed` (Task 8), `DealFeed` (Task 9), `TRACKED_SETS` (Task 4)
- Produces:
  ```ts
  export interface IngestionReport {
    set: string;
    cardmarket: { products: number; snapshots: number } | { error: string };
    providers: { marketplace: Marketplace; result?: Awaited<ReturnType<typeof ingestListings>>; error?: string }[];
  }
  export function runIngestion(db: Db, deps: { fetchJson: (url: string) => Promise<unknown>; providers: ListingProvider[] }, sets: TrackedSet[], now: Date): Promise<IngestionReport[]>
  ```
  `runIngestion` never throws because of a single source failing. It records the error message and carries on.

- [ ] **Step 1: Write the failing test** `test/slice.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runIngestion } from '@/ingest/run';
import { getDealFeed } from '@/deals/feed';
import { DealFeed } from '@/components/DealFeed';
import { createCardTraderProvider } from '@/providers/cardtrader/provider';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { createTestDb } from './helpers/db';
import { cardmarketFetch } from './helpers/cardmarket';
import { fakeProvider } from './helpers/fake-provider';
import { ctBlueprint, ctProduct } from './fixtures/cardtrader';

const NOW = new Date('2026-10-19T12:00:00Z');
const cardtrader = createCardTraderProvider({
  expansions: vi.fn(async () => [{ id: 501, game_id: 5, code: 'a', name: '30th Celebration' }]),
  blueprints: vi.fn(async () => [ctBlueprint({ id: 3003, card_market_ids: [895551] })]),
  marketplaceProducts: vi.fn(async () => ({ '3003': [ctProduct({ id: 42, blueprint_id: 3003, name_en: 'Elite Trainer Box', price: { cents: 9900, currency: 'EUR' }, properties_hash: { pokemon_language: 'de' } })] })),
});

describe('slice 1, end to end', () => {
  it('ingests Cardmarket and CardTrader data and shows a scored deal', async () => {
    const db = await createTestDb();
    const [report] = await runIngestion(db, { fetchJson: cardmarketFetch(), providers: [cardtrader] }, [SET], NOW);
    expect(report.cardmarket).toMatchObject({ products: 7, snapshots: 7 });
    expect(report.providers[0]).toMatchObject({ marketplace: 'cardtrader', result: { upserted: 1 } });
    render(<DealFeed deals={await getDealFeed(db, { now: NOW })} now={NOW} lastCheckedAt={NOW} />);
    expect(screen.getByRole('heading', { name: '30th Celebration Elite Trainer Box' })).toBeInTheDocument();
    expect(screen.getByText('€33.95 below market (26%)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', 'https://www.cardtrader.com/cards/3003');
  });
  it('keeps going when one provider fails', async () => {
    const db = await createTestDb();
    const [report] = await runIngestion(db, { fetchJson: cardmarketFetch(), providers: [fakeProvider('ebay', new Error('eBay down')), cardtrader] }, [SET], NOW);
    expect(report.providers).toEqual([
      { marketplace: 'ebay', error: 'eBay down' },
      expect.objectContaining({ marketplace: 'cardtrader', result: expect.objectContaining({ upserted: 1 }) }),
    ]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/slice.test.tsx`
Expected: FAIL, cannot resolve `@/ingest/run`

- [ ] **Step 3: Implement `runIngestion`, `scripts/migrate.ts` and `scripts/ingest.ts`**

`runIngestion`: for each set, run `ingestCardmarket` (on error, record it and still run the providers against the previous market values), then each provider's `ingestListings` in order. `scripts/migrate.ts` runs `migrate` from `drizzle-orm/postgres-js/migrator` against `createDb(process.env.DATABASE_URL)`. `scripts/ingest.ts` builds the deps (`fetchJson: url => fetchJson(url, { schema: z.unknown() })`; the CardTrader provider only if `CARDTRADER_TOKEN` is set, otherwise it prints `CARDTRADER_TOKEN not set: skipping CardTrader`), runs it with `new Date()`, prints a short per-set summary (counts and skip reasons, never the token), closes the connection and exits 1 if any error was recorded. Script: `"ingest": "tsx --env-file=.env.local scripts/ingest.ts"`.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites (71 tests), no network access.

- [ ] **Step 5: Run it for real**

Needs Docker running and `CARDTRADER_TOKEN` in `.env.local`. **If either is missing, stop and tell the owner what's needed.**

```bash
npx supabase init
npx supabase start
cp .env.example .env.local     # then paste the CardTrader token
npm run db:migrate
npm run ingest
npm run dev
```

Expected:
- `npm run ingest` reports about 226 products for 30th Celebration (191 singles + 35 sealed), the same number of snapshots on the first run, and a CardTrader upsert count above 0 with skip reasons listed.
- http://localhost:3000 shows deal cards, or the empty state with "Last checked just now".
- Click one "View listing" link and check it opens that product on CardTrader. If the URL format is wrong, fix it in `normalize.ts`, update the tests' expected URLs, and rerun `npm test`.
- Run `npm run ingest` a second time. Expected: 0 new snapshots, and the listing count stays the same.

- [ ] **Step 6: Write the README** (what pokedash is, prerequisites: Node 24, Docker, CardTrader token; the commands from Step 5; `npm test`)

- [ ] **Step 7: Commit**

```bash
git add src/ingest/run.ts scripts test/slice.test.tsx package.json README.md supabase
git commit -m "feat: run ingestion end to end and document local setup"
```
