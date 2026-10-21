import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupOldData, databaseSizeBytes } from './retention';
import { benchmarkSnapshots, listingPriceHistory, listings, products, usReferencePrices } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';

const NOW = new Date('2026-10-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
let db: Db;

async function listing(externalId: string, productId: number, available: boolean, seenDaysAgo: number) {
  const [row] = await db
    .insert(listings)
    .values({
      marketplace: 'cardtrader', externalId, productId, title: 't', url: 'u', priceCents: 100, currency: 'EUR',
      available, firstSeenAt: daysAgo(seenDaysAgo + 1), lastSeenAt: daysAgo(seenDaysAgo),
    })
    .returning();
  return row.id;
}

beforeEach(async () => {
  db = await createTestDb();
  const [p] = await db
    .insert(products)
    .values({ cardmarketId: 1, name: 'p', kind: 'sealed', categoryName: 'c', cardmarketExpansionId: 1, setKey: 's', updatedAt: NOW })
    .returning();
  const old = await listing('old', p.id, false, 31);
  await listing('recent', p.id, false, 29);
  const kept = await listing('available', p.id, true, 40);
  await db.insert(listingPriceHistory).values([
    { listingId: old, priceCents: 100, observedAt: daysAgo(31) },
    { listingId: kept, priceCents: 100, observedAt: daysAgo(91) },
    { listingId: kept, priceCents: 100, observedAt: daysAgo(89) },
  ]);
  await db.insert(usReferencePrices).values([
    { productId: p.id, capturedAt: daysAgo(31), capturedDay: '2026-09-19', usdCents: 1 },
    { productId: p.id, capturedAt: daysAgo(29), capturedDay: '2026-09-21', usdCents: 1 },
  ]);
  await db.insert(benchmarkSnapshots).values([
    { productId: p.id, capturedAt: daysAgo(366) },
    { productId: p.id, capturedAt: daysAgo(364) },
  ]);
});

describe('cleanupOldData', () => {
  it('deletes data past its retention and keeps the rest', async () => {
    expect(await cleanupOldData(db, NOW)).toEqual({ listings: 1, priceHistory: 2, usPrices: 1, benchmarks: 1 });
    expect((await db.select().from(listings)).map((l) => l.externalId).sort()).toEqual(['available', 'recent']);
    expect(await db.select().from(listingPriceHistory)).toHaveLength(1);
    expect(await db.select().from(usReferencePrices)).toHaveLength(1);
    expect(await db.select().from(benchmarkSnapshots)).toHaveLength(1);
  });
});

describe('databaseSizeBytes', () => {
  it('reports the database size in bytes', async () => {
    expect(await databaseSizeBytes(db)).toBeGreaterThan(0);
  });
});
