# pokedash Search & Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a name search to every dashboard list, a language filter to every list, and Deals-only filters for type, minimum saving and maximum price.

**Architecture:**
- **Where filters live:** filters are URL search params, read by the existing `parseDashboardParams`. One GET `<form>` (the filter bar) sets them, so they work without JavaScript and can be bookmarked.
- **How filtering works:** filtering happens on the server, in pure functions: `filterDeals` for the deal feed, plus new options on `getSectionRows`.
- **What stays global:** the stats row and the tab counts keep showing whole-set totals.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents`), React 19, TypeScript strict, Tailwind v4, Drizzle, Vitest 5 + Testing Library + PGlite.

**Spec:** none separate. The owner asked for "filter functions for the lists and a search functionality" and handed the design to Claude ("continue with search filters"). The decisions below are Claude's calls and stand in for the spec.

## Design (Claude's calls)

**URL params.** These come on top of the existing `tab`, `all` and `type`.

| Param | Values | Applies to |
|---|---|---|
| `q` | Free text, trimmed, max 100 chars. Empty means no search. | All tabs |
| `lang` | `en` \| `de`. Anything else means all languages. | All tabs |
| `kind` | `single` \| `sealed` | Deals |
| `min` | `30` \| `40` \| `50` (minimum saving %). The deal threshold of 20% stays the floor. | Deals |
| `max` | Whole euros, 1–100000 (maximum item price) | Deals |

Invalid values are ignored and treated as unset, never as an error.

**Search matching.**
- Both the name and the query are lower-cased and have diacritics removed (`é`→`e`).
- Every character that isn't a letter or digit becomes a space.
- The query is split into words. Every word must appear as a substring of the normalised name. So "pika 25" matches "Pikachu (25th Anniversary)", and "pokemon" matches "Pokémon".

**Language.**
- **Deals:** keeps only listings with that `language`.
- **Singles / Sealed:** the cheapest offer is chosen among that language's offers only. Products without such an offer still appear, with no offer.

**Deals filters.**
- `kind` matches `DealView.kind`.
- `min` keeps deals whose rounded percent, as shown on the tile (`Math.round(score.discountPct * 100)`), is `>= min`.
- `max` keeps deals with `priceCents <= max * 100`, where `priceCents` is the item price shown on the tile.
- The sort is unchanged. The hero is the first deal of the filtered list.

**Navigation.**
- Switching tabs keeps `q` and `lang` and drops the Deals-only params.
- The existing section chips (Worth €5+ / All singles / sealed types) keep `q` and `lang`.
- Every link is built by one helper.

**UI: one filter bar above the list on every tab.** It is a GET form with these controls:

| Control | Label | Details |
|---|---|---|
| `<input type="search" name="q">` | "Search" | placeholder "Search by name…" |
| `<select name="lang">` | "Language" | "All languages" / "English" / "German" |
| `<select name="kind">` (Deals only) | "Type" | "Singles and sealed" / "Singles" / "Sealed" |
| `<select name="min">` (Deals only) | "Min. saving" | "20% (all deals)" / "30%+" / "40%+" / "50%+" |
| `<input type="number" name="max" min="1" step="1">` (Deals only) | "Max. price (€)" | |

- Hidden inputs carry `tab`, plus `all`/`type` on the section tabs.
- A submit button reads "Apply".
- A "Clear filters" link appears only when a filter is active. It keeps `tab`, `all` and `type`.
- Every control has a visible label and is at least 44 px tall, and the bar wraps on narrow screens.

**Result line and empty state.**
- When any filter is active, a line above the list reads "`N` deal(s) match your filters" or "`N` product(s) match your filters", with correct singular and plural.
- If nothing matches, show a panel "Nothing matches your filters." with a "Clear filters" link, instead of the usual empty state.

**Non-goals:**
- sort controls
- filters on the stats row or the tab counts
- saved searches or alerts
- live as-you-type filtering (client JS)
- searching fields other than the product name

## Global Constraints

- **Auth:** don't touch it. `Feed` keeps calling `requireAal2()` first, and filtering happens after it.
- **No new dependencies.** Keep `npm audit` at 0.
- **Next.js:** read request data inside the existing `<Suspense>` after `await connection()`. `searchParams` is a Promise. Read `node_modules/next/dist/docs/01-app/02-guides/forms.md` before writing the form.
- **CSP** is unchanged (`form-action 'self'`; a GET form to the same page is allowed).
- **Copy:** UI copy is English, exactly as above. Controls are at least 44 px tall, with visible focus rings and AA contrast. Use the Aurora tokens from `src/app/globals.css`.
- **Git:** commit with explicit paths and end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Never read `.env.local`.

## Review Focus

1. **Hostile `q`:** a 10,000-char string, `<script>`, `%00`, an array param (`q=a&q=b`), or only punctuation. Each must be truncated or ignored safely. It must never throw, and it must be rendered escaped (React). Pinned in Task 1.
2. **Garbage numbers:** `max=abc`, `max=-5`, `max=1e9`, `min=25`. These are ignored, never crash or filter everything out. Pinned in Task 1.
3. **Filters plus an empty data set:** filters on an empty feed show the normal empty state ("No deals right now."), not "Nothing matches". The filtered empty state appears only when there were deals before filtering. Pinned in Task 3.
4. **Tab switch keeps the search:** `?tab=deals&q=pika&min=40` → the Singles tab link is `?tab=singles&q=pika`. Pinned in Task 1.

---

### Task 1: Search matching, params and links (pure)

**Files:**
- Create: `src/lib/search.ts`, `src/lib/search.test.ts`
- Modify: `src/lib/params.ts`, `src/lib/params.test.ts`

**Interfaces:**
- Produces, in `search.ts`:
  - `normalizeForSearch(s: string): string`
  - `matchesQuery(name: string, q: string): boolean`. An empty or punctuation-only `q` gives `true`.
- Produces, in `params.ts`:
  - `DashboardParams` gains `q: string; lang: 'en' | 'de' | null; kind: ProductKind | null; minPct: 30 | 40 | 50 | null; maxPriceCents: number | null`.
  - `hasActiveFilters(p: DashboardParams): boolean`. It returns true if `q`, `lang`, `kind`, `minPct` or `maxPriceCents` is set; `all` and `type` don't count.
  - `dashboardHref(p: DashboardParams, overrides?: Partial<DashboardParams>): string`.
    - It returns `?tab=…` plus only the non-default params, in a stable order: `tab, q, lang, kind, min, max, all, type`.
    - `q` is URL-encoded.
    - When the resulting tab isn't `deals`, `kind`, `min` and `max` are dropped. When it isn't `singles`, `all` is dropped. When it isn't `sealed`, `type` is dropped.
  - `clearFiltersHref(p: DashboardParams): string`. It keeps `tab`, `all` and `type`.

- [ ] **Step 1: Write failing tests**
  - **search:**
    - `matchesQuery('Pokémon Center Elite Trainer Box', 'pokemon etb')` → false, because "etb" isn't in the name.
    - `matchesQuery('Pokémon Center Elite Trainer Box', 'pokemon elite')` → true.
    - `matchesQuery('Pikachu (25th Anniversary)', 'pika 25')` → true.
    - `matchesQuery('X', '')` → true, and `matchesQuery('X', '!!!')` → true.
    - `normalizeForSearch('Évoli-ex')` → `'evoli ex'`.
  - **params:**
    - `parseDashboardParams({ q: '  pika  ', lang: 'de', kind: 'sealed', min: '40', max: '120' })` → `q: 'pika'`, `lang: 'de'`, `kind: 'sealed'`, `minPct: 40`, `maxPriceCents: 12000`.
    - A `q` of 10,000 chars → length 100.
    - `q: ['a','b']` → `''`.
    - Each of `max: 'abc'`, `'-5'`, `'0'`, `'1e9'`, `'100001'` and `'12.5'` → `null`.
    - `min: '25'` → `null`.
    - `lang: 'it'` → `null`.
    - `kind: 'slab'` → `null`.
    - The existing tests are updated to the new shape, with defaults `q: ''`, the rest `null`.
  - **links:**
    - `dashboardHref(parse({ tab:'deals', q:'pika', min:'40' }), { tab: 'singles' })` → `'?tab=singles&q=pika'`.
    - `dashboardHref(parse({ tab:'sealed', type:'etb', lang:'en' }))` → `'?tab=sealed&lang=en&type=etb'`.
    - `dashboardHref(parse({ q:'a b&c' }))` → `'?tab=deals&q=a%20b%26c'`.
    - `clearFiltersHref(parse({ tab:'singles', all:'1', q:'x', lang:'de' }))` → `'?tab=singles&all=1'`.
    - `hasActiveFilters(parse({ tab:'singles', all:'1' }))` → false.
    - `hasActiveFilters(parse({ min:'30' }))` → true.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/lib/search.test.ts src/lib/params.test.ts`
- [ ] **Step 3: Implement**
  - Keep the strict number rule: `/^\d+$/`, then a range check.
  - Fix any callers of `DashboardParams` that the new fields break (`src/app/page.tsx`).
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint`
  Expected: all pass.
- [ ] **Step 5: Commit**

  Commit `src/lib/search.ts`, `src/lib/search.test.ts`, `src/lib/params.ts`, `src/lib/params.test.ts`, and any caller you touched, with the message `feat: search matching, filter params and links`.

---

### Task 2: Filtering the data

**Files:**
- Create: `src/deals/filters.ts`, `src/deals/filters.test.ts`
- Modify: `src/deals/sections.ts`, `src/deals/sections.test.ts`

**Interfaces:**
- Consumes: `matchesQuery` (Task 1).
- Produces:
  - `interface DealFilters { q: string; lang: 'en' | 'de' | null; kind: ProductKind | null; minPct: number | null; maxPriceCents: number | null }`
  - `filterDeals(deals: DealView[], f: DealFilters): DealView[]`. It keeps the input order and never mutates the input.
  - `getSectionRows` opts gain `query?: string` (name match) and `language?: 'en' | 'de'`. The language replaces the `['en','de']` listing filter with `[language]`. Products with no offer in that language stay listed, with `offer: null` and `offerCount: 0`.

- [ ] **Step 1: Write failing tests**
  - **filters.test.ts:** build `DealView` fixtures (reuse the existing helpers or fixtures from `src/deals/feed.test.ts` if there are any) and test:
    - each filter alone
    - all five filters combined
    - an empty filter object (`q: ''`, the rest `null`), which returns the input unchanged
    - that the order is kept
  - **sections.test.ts:**
    - `query: 'pika'` keeps only matching products.
    - `language: 'de'` picks the cheapest German offer even when an English one is cheaper.
    - A product with only English offers under `language: 'de'` gives `offer: null`.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/deals/filters.test.ts src/deals/sections.test.ts`
- [ ] **Step 3: Implement.** Do the name match in memory, after the existing row building and before the sort.
- [ ] **Step 4: Verify**

  Run: `npm test && npm run typecheck && npm run lint`
- [ ] **Step 5: Commit**

  Commit the four files with the message `feat: filter deals and section rows by search, language and deal filters`.

---

### Task 3: Filter bar, page wiring, result line and empty states

**Files:**
- Create: `src/components/FilterBar.tsx`, `src/components/FilterBar.test.tsx`
- Modify:
  - `src/app/page.tsx`
  - `src/components/SectionTabs.tsx` (+ test)
  - `src/components/SectionTable.tsx` (+ test)
  - `src/components/DealFeed.tsx` (+ test)

**Interfaces:**
- Consumes: `DashboardParams`, `dashboardHref`, `clearFiltersHref` and `hasActiveFilters` (Task 1), plus `filterDeals` and the `getSectionRows` options (Task 2).
- Produces: `FilterBar({ params }: { params: DashboardParams })`, a server component with the GET form described in the Design. It sends no request data of its own and takes everything from `params`.

- [ ] **Step 1: Write failing tests**
  - **FilterBar:**
    - On deals it renders labelled controls "Search", "Language", "Type", "Min. saving" and "Max. price (€)", plus an "Apply" button. On singles and sealed it renders only "Search" and "Language".
    - The inputs are pre-filled from `params`.
    - The hidden `tab` is set, plus `all`/`type` on section tabs.
    - "Clear filters" shows only when `hasActiveFilters`, and its href equals `clearFiltersHref`.
  - **SectionTabs:** with `q='pika'` and `minPct=40` on deals, the Singles link href is `?tab=singles&q=pika`.
  - **SectionTable chips:** they keep `q` and `lang`.
  - **DealFeed:**
    - When `filtered` is true and there are no deals, it shows "Nothing matches your filters." and a "Clear filters" link.
    - When the unfiltered feed is empty, it shows "No deals right now." (Review Focus 3).
    - The result line "1 deal matches your filters" / "3 deals match your filters" appears only when filters are active.
- [ ] **Step 2: Run them and watch them fail**

  Run: `npx vitest run src/components`
- [ ] **Step 3: Implement**
  - In `page.tsx`:
    - Parse the params once.
    - Compute `allDeals = getDealFeed(...)` and `deals = filterDeals(allDeals, params)`.
    - Pass `query` and `language` into `getSectionRows`.
    - Stats and tab counts use `allDeals` and the unfiltered counts.
    - Render `FilterBar` between `SectionTabs` and the list.
  - `DealFeed` gets an optional `filter?: { active: boolean; totalBefore: number; clearHref: string }`. This lets it tell "nothing matches" apart from "no deals".
  - `SectionTable` gets the same result line and empty-match handling for products.
- [ ] **Step 4: Verify**
  - Run: `npm test && npm run typecheck && npm run lint && npm run build`
  - Then, with `npm run dev` and a logged-in local session: `?tab=deals&q=pikachu`, `?tab=sealed&lang=de`, and `?tab=deals&min=50&max=20` render without errors.
- [ ] **Step 5: Commit**

  Commit the files with the message `feat: filter bar with search, language and deal filters`.
