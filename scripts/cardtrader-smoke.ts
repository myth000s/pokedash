import { THIRTIETH_CELEBRATION as SET } from '../src/config/sets';
import { createCardTraderClient } from '../src/providers/cardtrader/client';
import { normalizeCtProduct } from '../src/providers/cardtrader/normalize';
import { createDb } from '../src/db/client';
import { products } from '../src/db/schema';

async function trackedIds(): Promise<ReadonlySet<number> | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const db = createDb(url);
  try {
    const rows = await db.select({ id: products.cardmarketId }).from(products);
    return new Set(rows.map((r) => r.id));
  } finally {
    // createDb hides the postgres client; end it through the drizzle session client.
    const client = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
    await client?.end?.();
  }
}

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
  console.log(tracked ? `Tracked Cardmarket ids from database: ${tracked.size}` : 'No DATABASE_URL: every Cardmarket id counts as tracked');

  let blueprintCount = 0;
  let withCmIds = 0;
  const propExamples = new Map<string, Set<string>>();
  const normalized = { count: 0 };
  const skipReasons = new Map<string, number>();

  for (const e of expansions) {
    const blueprints = await client.blueprints(e.id);
    blueprintCount += blueprints.length;
    withCmIds += blueprints.filter((b) => b.card_market_ids.length > 0).length;
    const byId = new Map(blueprints.map((b) => [b.id, b]));
    const allIds = tracked ?? new Set(blueprints.flatMap((b) => b.card_market_ids));

    const grouped = await client.marketplaceProducts(e.id);
    for (const list of Object.values(grouped)) {
      for (const p of list) {
        for (const [k, v] of Object.entries(p.properties_hash)) {
          const set = propExamples.get(k) ?? new Set<string>();
          if (set.size < 5) set.add(String(v));
          propExamples.set(k, set);
        }
        const r = normalizeCtProduct(p, byId.get(p.blueprint_id), allIds);
        if ('listing' in r) normalized.count++;
        else skipReasons.set(r.skip, (skipReasons.get(r.skip) ?? 0) + 1);
      }
    }
  }

  console.log(`Blueprints: ${blueprintCount} (${withCmIds} with card_market_ids)`);
  console.log('properties_hash keys:');
  for (const [k, vals] of propExamples) console.log(`  ${k}: ${[...vals].join(', ')}`);
  console.log(`Normalized: ${normalized.count}`);
  console.log('Skipped by reason:');
  for (const [reason, n] of skipReasons) console.log(`  ${reason}: ${n}`);
}

main().catch((err) => {
  // Print only the message; never dump request details that could carry the token.
  console.error('Smoke run failed:', err instanceof Error ? err.message : 'unknown error');
  process.exitCode = 1;
});
