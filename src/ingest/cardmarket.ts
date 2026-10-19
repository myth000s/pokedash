import { products, benchmarkSnapshots } from '@/db/schema';
import type { Db } from '@/db/client';
import type { TrackedSet } from '@/config/sets';
import { CARDMARKET_URLS, parseCatalog, parsePriceGuide } from '@/providers/cardmarket/parse';

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

  return db.transaction(async (tx) => {
    let snapshots = 0;
    for (const p of catalog) {
      const values = {
        name: p.name,
        kind: p.kind,
        categoryName: p.categoryName,
        cardmarketExpansionId: p.expansionId,
        setKey: set.key,
        updatedAt: now,
      };
      const [row] = await tx
        .insert(products)
        .values({ cardmarketId: p.cardmarketId, ...values })
        .onConflictDoUpdate({ target: products.cardmarketId, set: values })
        .returning({ id: products.id });

      const g = guide.byProductId.get(p.cardmarketId);
      if (!g) continue;
      const inserted = await tx
        .insert(benchmarkSnapshots)
        .values({
          productId: row.id,
          capturedAt: guide.capturedAt,
          avgCents: g.avg, lowCents: g.low, trendCents: g.trend,
          avg1Cents: g.avg1, avg7Cents: g.avg7, avg30Cents: g.avg30,
          avgHoloCents: g.avgHolo, lowHoloCents: g.lowHolo, trendHoloCents: g.trendHolo,
          avg1HoloCents: g.avg1Holo, avg7HoloCents: g.avg7Holo, avg30HoloCents: g.avg30Holo,
        })
        .onConflictDoNothing({ target: [benchmarkSnapshots.productId, benchmarkSnapshots.capturedAt] })
        .returning({ id: benchmarkSnapshots.id });
      snapshots += inserted.length;
    }
    return { products: catalog.length, snapshots, capturedAt: guide.capturedAt };
  });
}
