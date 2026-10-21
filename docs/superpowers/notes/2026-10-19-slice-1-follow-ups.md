# Slice 1: open follow-ups

These are what remained after slice 1's final review (merged 2026-10-19). None of them can produce a wrong deal today. Each is listed under the slice where it starts to matter.

## Before scheduled ingestion (slice 6)
- **`fetchJson` timeouts.** Add a timeout around the body read too (`await res.json()` sits outside the try, so a slow body throws an unwrapped AbortError without retrying). Release non-OK response bodies before retrying. An empty `Retry-After` header currently means a 0 s wait.
- **Run lock.** ~~Prevent two ingests from overlapping. `ingestListings` reads existing rows outside its transaction, so overlapping runs could write duplicate history rows.~~ Resolved on branch `feat/online`: both ingest workflows share the GitHub Actions concurrency group `ingest`.
- **Indexes.** Add foreign-key indexes on `listings.product_id` and `listing_price_history.listing_id`. Batch the per-row inserts if more sets are added.
- **Hosted Supabase.** ~~Use `prepare: false` for the transaction pooler, plus SSL. Run `npm audit` before deploying.~~ Resolved on branch `feat/online`: `prepare: false` is set for the Supabase pooler, connections use `sslmode=require`, and `npm audit` reports 0 findings (CI also runs `npm audit --omit=dev --audit-level=high`). Re-run `npm audit` before each later deploy.

## When non-deals or alerts are shown (slices 3–4)
- **Rounding.** "Only 20% below market value (needs 20%)" can appear for a 19.6% discount; consider `Math.floor`.
- **Minimum-value wording.** "Market value under €5.5" (no second decimal) would appear if the minimum value setting changed.
- **Wording below 48 h.** "N days old" and "not seen for N days" read badly if the thresholds drop below 48 h ("0 days", "1 days").
- **Empty state.** After a run that finds zero offers, the page still says "No listings have been checked yet." This needs an `ingestion_runs` table (slice 5).
- **Freshness.** Market values older than 3 days and listings unseen for 3 days no longer produce deals (owner decision). Tune this once alerts exist.
- **New-set markets.** About 12,600 listings were "unreliable" because the 30-day average sits far above the trend while prices are still falling. Consider comparing only `avg7` with the trend.
- **Shipping.** Raising the minimum market value to about €15 would hide deals that shipping eats up.

## When a second set or provider arrives
- **Untested paths in the listing sweep.** The sweep is scoped per set, but that isn't tested. Neither are the "Untracked product" skip and a shipping-only price change.
- **Provider sanity check.** `ingestListings` stores rows under `provider.marketplace`. A mismatched `listing.marketplace` is overridden silently; consider skipping it instead.
- **CardTrader expansions.** The provider also fetches the JP, Simplified Chinese and Premium Deck Set expansions. Their offers are skipped by ID matching, but it costs extra API calls.
- **Shared DB client.** `closeDb` exists in `src/db/client.ts`; use it everywhere a script closes the database.

## Small code hygiene
- **Error page name.** `src/app/error.tsx` names its export `Error`, which shadows the global.
- **Untested Cardmarket paths.** An unparseable `createdAt`, a mid-transaction rollback, and the Cardmarket-failure path in `runIngestion`.
- **`CT_CONDITIONS` lookup.** It could use `Object.hasOwn`.
