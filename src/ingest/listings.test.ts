import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestListings } from './listings';
import { ingestCardmarket } from './cardmarket';
import { listings, listingPriceHistory, products } from '@/db/schema';
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
  it('stores product pictures and TCGplayer ids from the provider', async () => {
    const provider = { marketplace: 'cardtrader' as const, fetchListings: async () => ({
      listings: [], skipped: [], products: [{ cardmarketProductId: 895551, imageUrl: 'https://cardtrader.com/etb.jpg', tcgplayerId: 704143 }] }) };
    await ingestListings(db, provider, SET, T1);
    const [etb] = await db.select().from(products).where(eq(products.cardmarketId, 895551));
    expect(etb).toMatchObject({ imageUrl: 'https://cardtrader.com/etb.jpg', tcgplayerId: 704143 });
  });
  it('clears product metadata when the provider reports null', async () => {
    const meta = (imageUrl: string | null, tcgplayerId: number | null) => ({ marketplace: 'cardtrader' as const, fetchListings: async () => ({
      listings: [], skipped: [], products: [{ cardmarketProductId: 895551, imageUrl, tcgplayerId }] }) });
    await ingestListings(db, meta('https://cardtrader.com/etb.jpg', 704143), SET, T1);
    await ingestListings(db, meta(null, null), SET, T2);
    const [etb] = await db.select().from(products).where(eq(products.cardmarketId, 895551));
    expect(etb).toMatchObject({ imageUrl: null, tcgplayerId: null });
  });
  it('stores and updates the picture link', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, T1);
    expect((await db.select().from(listings))[0].imageUrl).toBeNull();
    await ingestListings(db, fakeProvider('cardtrader', [makeListing({ imageUrl: 'https://www.cardtrader.com/uploads/etb.jpg' })]), SET, T2);
    expect((await db.select().from(listings))[0].imageUrl).toBe('https://www.cardtrader.com/uploads/etb.jpg');
  });
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
