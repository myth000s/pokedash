import { sql } from 'drizzle-orm';
import { products, benchmarkSnapshots } from '@/db/schema';
import type { Db } from '@/db/client';
import type { TrackedSet } from '@/config/sets';
import { CARDMARKET_URLS, parseCatalog, parsePriceGuide } from '@/providers/cardmarket/parse';

const WRITE_BATCH_SIZE = 500;

// On conflict, refresh everything Cardmarket owns; pictures, TCGplayer ids and rarity come from the listings run.
const PRODUCT_UPSERT_SET = {
  name: sql`excluded.name`,
  kind: sql`excluded.kind`,
  categoryName: sql`excluded.category_name`,
  cardmarketExpansionId: sql`excluded.cardmarket_expansion_id`,
  setKey: sql`excluded.set_key`,
  updatedAt: sql`excluded.updated_at`,
};

export async function ingestCardmarket(
  db: Db,
  deps: { fetchJson: (url: string) => Promise<unknown> },
  set: TrackedSet,
): Promise<{ products: number; snapshots: number; capturedAt: Date }> {
  // Download and parse everything before writing anything.
  const [singlesJson, nonSinglesJson, guideJson] = await Promise.all([
    deps.fetchJson(CARDMARKET_URLS.singles),
    deps.fetchJson(CARDMARKET_URLS.nonSingles),
    deps.fetchJson(CARDMARKET_URLS.priceGuide),
  ]);
  const catalog = [
    ...parseCatalog(singlesJson, 'single', set),
    ...parseCatalog(nonSinglesJson, 'sealed', set),
  ];
  const guide = parsePriceGuide(guideJson);
  const now = new Date();

  // One row per Cardmarket product (the last one wins, as one-by-one upserts would).
  const unique = [...new Map(catalog.map((p) => [p.cardmarketId, p])).values()];

  // Each statement is a round trip to the hosted database, so write in batches.
  return db.transaction(async (tx) => {
    let snapshots = 0;
    for (let i = 0; i < unique.length; i += WRITE_BATCH_SIZE) {
      const batch = unique.slice(i, i + WRITE_BATCH_SIZE);
      const written = await tx
        .insert(products)
        .values(batch.map((p) => ({
          cardmarketId: p.cardmarketId, name: p.name, kind: p.kind, categoryName: p.categoryName,
          cardmarketExpansionId: p.expansionId, setKey: set.key, updatedAt: now,
        })))
        .onConflictDoUpdate({ target: products.cardmarketId, set: PRODUCT_UPSERT_SET })
        .returning({ id: products.id, cardmarketId: products.cardmarketId });

      const values = written.flatMap(({ id, cardmarketId }) => {
        const g = guide.byProductId.get(cardmarketId);
        return g ? [{
          productId: id,
          capturedAt: guide.capturedAt,
          avgCents: g.avg, lowCents: g.low, trendCents: g.trend,
          avg1Cents: g.avg1, avg7Cents: g.avg7, avg30Cents: g.avg30,
          avgHoloCents: g.avgHolo, lowHoloCents: g.lowHolo, trendHoloCents: g.trendHolo,
          avg1HoloCents: g.avg1Holo, avg7HoloCents: g.avg7Holo, avg30HoloCents: g.avg30Holo,
        }] : [];
      });
      if (values.length === 0) continue;
      const inserted = await tx
        .insert(benchmarkSnapshots)
        .values(values)
        .onConflictDoNothing({ target: [benchmarkSnapshots.productId, benchmarkSnapshots.capturedAt] })
        .returning({ id: benchmarkSnapshots.id });
      snapshots += inserted.length;
    }
    return { products: catalog.length, snapshots, capturedAt: guide.capturedAt };
  });
}
