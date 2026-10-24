import { THIRTIETH_CELEBRATION as SET } from '../src/config/sets';
import { createCardTraderClient } from '../src/providers/cardtrader/client';
import { normalizeCtProduct } from '../src/providers/cardtrader/normalize';
import { closeDb, createDb } from '../src/db/client';
import { products } from '../src/db/schema';

async function trackedIds(): Promise<ReadonlySet<number> | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const db = createDb(url);
  try {
    const rows = await db.select({ id: products.cardmarketId }).from(products);
    return new Set(rows.map((r) => r.id));
  } catch {
    // Unreachable or unmigrated database: fall back to treating every id as tracked.
    console.log('DATABASE_URL is set but the database is unreachable or not migrated: falling back to "every Cardmarket id counts as tracked"');
    return null;
  } finally {
    await closeDb(db).catch(() => {});
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function main() {
  const token = process.env.CARDTRADER_TOKEN;
  if (!token) {
    console.log('CARDTRADER_TOKEN is not set. Add it to .env.local and run again.');
    return;
  }
  const client = createCardTraderClient({ token });

  const expansions = (await client.expansions())
    .filter((e) => e.name.startsWith(SET.cardtraderExpansionPrefix))
    .sort((a, b) => a.id - b.id);
  console.log('Matching expansions:');
  for (const e of expansions) console.log(`  ${e.id}  ${e.name}`);
  if (expansions.length === 0) return;

  const tracked = await trackedIds();
  console.log(tracked ? `Tracked Cardmarket ids from database: ${tracked.size}` : 'Every Cardmarket id counts as tracked (no usable database)');

  let blueprintCount = 0;
  let withCmIds = 0;
  const propExamples = new Map<string, Set<string>>();
  const normalized = { count: 0 };
  const skipReasons = new Map<string, number>();
  const currencies = new Map<string, number>();
  const topLevelDefined = { graded: 0, on_vacation: 0, bundle_size: 0 };
  const userVacationKeys = new Set<string>();
  let offersSeen = 0;
  let sampleOffer: Record<string, unknown> | null = null;

  for (const e of expansions) {
    const blueprints = await client.blueprints(e.id);
    blueprintCount += blueprints.length;
    withCmIds += blueprints.filter((b) => b.card_market_ids.length > 0).length;
    const byId = new Map(blueprints.map((b) => [b.id, b]));
    const allIds = tracked ?? new Set(blueprints.flatMap((b) => b.card_market_ids));

    const grouped = await client.marketplaceProducts(e.id, 'en');
    for (const list of Object.values(grouped)) {
      for (const p of list) {
        for (const [k, v] of Object.entries(p.properties_hash)) {
          const set = propExamples.get(k) ?? new Set<string>();
          if (set.size < 5) set.add(JSON.stringify(v));
          propExamples.set(k, set);
        }
        offersSeen++;
        const raw: Record<string, unknown> = p;
        sampleOffer ??= raw;
        for (const key of Object.keys(topLevelDefined) as (keyof typeof topLevelDefined)[]) {
          if (raw[key] !== undefined && raw[key] !== null) topLevelDefined[key]++;
        }
        if (isObject(raw.user)) {
          for (const k of Object.keys(raw.user)) if (k.toLowerCase().includes('vacation')) userVacationKeys.add(k);
        }
        if (isObject(raw.price) && typeof raw.price.currency === 'string') {
          currencies.set(raw.price.currency, (currencies.get(raw.price.currency) ?? 0) + 1);
        }
        const r = normalizeCtProduct(p, byId.get(p.blueprint_id), allIds, { set: SET, expansionId: e.id });
        if ('listing' in r) normalized.count++;
        else skipReasons.set(r.skip, (skipReasons.get(r.skip) ?? 0) + 1);
      }
    }
  }

  console.log(`Blueprints: ${blueprintCount} (${withCmIds} with card_market_ids)`);
  console.log('properties_hash keys:');
  for (const [k, vals] of propExamples) console.log(`  ${k}: ${[...vals].join(', ')}`);
  console.log(`Offers seen: ${offersSeen}`);
  if (sampleOffer) {
    const o: Record<string, unknown> = sampleOffer;
    console.log(`Offer top-level keys: ${Object.keys(o).sort().join(', ')}`);
    console.log(`Offer user keys: ${isObject(o.user) ? Object.keys(o.user).sort().join(', ') : '(none)'}`);
    console.log(`Offer price keys: ${isObject(o.price) ? Object.keys(o.price).sort().join(', ') : '(none)'}`);
  }
  console.log(`price.currency tally: ${[...currencies].map(([c, n]) => `${c}=${n}`).join(', ') || '(none)'}`);
  console.log('Offers defining top-level field:');
  for (const [k, n] of Object.entries(topLevelDefined)) console.log(`  ${k}: ${n} of ${offersSeen}`);
  console.log(`user.*vacation* keys: ${userVacationKeys.size ? [...userVacationKeys].join(', ') : '(none)'}`);
  console.log(`Normalized: ${normalized.count}`);
  console.log('Skipped by reason:');
  for (const [reason, n] of skipReasons) console.log(`  ${reason}: ${n}`);
}

main().catch((err) => {
  // Print only the message; never dump request details that could carry the token.
  console.error('Smoke run failed:', err instanceof Error ? err.message : 'unknown error');
  process.exitCode = 1;
});
