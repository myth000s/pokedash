import { and, count, eq, inArray, max } from 'drizzle-orm';
import { benchmarkSnapshots, listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { TRACKED_SETS } from '@/config/sets';

export interface FeedStats {
  listingsChecked: number;
  productsTracked: number;
  marketValuesAt: Date | null;
  lastCheckedAt: Date | null;
}

export async function getFeedStats(db: Db, setKey: string | null): Promise<FeedStats> {
  const inSet = setKey === null ? inArray(products.setKey, TRACKED_SETS.map((s) => s.key)) : eq(products.setKey, setKey);
  const [[tracked], [checked], [values], [seen]] = await Promise.all([
    db.select({ n: count() }).from(products).where(inSet),
    db.select({ n: count() }).from(listings)
      .innerJoin(products, eq(listings.productId, products.id))
      .where(and(inSet, eq(listings.available, true))),
    db.select({ at: max(benchmarkSnapshots.capturedAt) }).from(benchmarkSnapshots)
      .innerJoin(products, eq(benchmarkSnapshots.productId, products.id))
      .where(inSet),
    db.select({ at: max(listings.lastSeenAt) }).from(listings)
      .innerJoin(products, eq(listings.productId, products.id))
      .where(inSet),
  ]);
  return {
    listingsChecked: checked.n,
    productsTracked: tracked.n,
    marketValuesAt: values.at ?? null,
    lastCheckedAt: seen.at ?? null,
  };
}
