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
  it('writes a set of 650 products and their values with a few statements', async () => {
    const statements: string[] = [];
    const db = await createTestDb({ logger: { logQuery: (q) => statements.push(q) } });
    const ids = Array.from({ length: 650 }, (_, i) => 800000 + i);
    const createdAt = '2026-10-19T12:36:50+0200';
    const singles = {
      version: 1, createdAt,
      products: ids.map((idProduct) => ({ idProduct, name: `Card ${idProduct}`, categoryName: 'Pokémon Single', idExpansion: SET.cardmarketExpansionIds[0] })),
    };
    const priceGuide = { version: 1, createdAt: '2026-10-19T02:42:46+0200', priceGuides: ids.map((idProduct) => ({ idProduct, trend: 1.5 })) };
    statements.length = 0;
    const r = await ingestCardmarket(db, { fetchJson: cardmarketFetch({ singles, priceGuide, nonSingles: { version: 1, createdAt, products: [] } }) }, SET);
    expect(r).toMatchObject({ products: 650, snapshots: 650 });
    // 2 product upserts and 2 snapshot inserts (batches of 500).
    expect(statements.filter((q) => /^insert into "products"/i.test(q))).toHaveLength(2);
    expect(statements.filter((q) => /^insert into "benchmark_snapshots"/i.test(q))).toHaveLength(2);
    expect(statements.length).toBeLessThanOrEqual(4);
    expect(await countOf(db, products)).toBe(650);
    const [p] = await db.select().from(products).where(eq(products.cardmarketId, 800321));
    const [snap] = await db.select().from(benchmarkSnapshots).where(eq(benchmarkSnapshots.productId, p.id));
    expect(snap.trendCents).toBe(150);
  });
});
