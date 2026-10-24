import { describe, it, expect, beforeEach } from 'vitest';
import { getFeedStats } from './stats';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET, JUNGLE } from '@/config/sets';
import { listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { fakeProvider } from '../../test/helpers/fake-provider';
import { makeListing } from '../../test/fixtures/listings';

const NOW = new Date('2026-10-19T12:00:00Z');
const LATER = new Date('2026-10-19T12:15:00Z');
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
});

describe('getFeedStats', () => {
  it('counts available listings and tracked products for the set', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing(), makeListing({ externalId: 'ct-2' })]), SET, NOW);
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, LATER); // ct-2 becomes unavailable
    expect(await getFeedStats(db, SET.key)).toEqual({
      listingsChecked: 1, productsTracked: 7,
      marketValuesAt: new Date('2026-10-19T00:42:46Z'), lastCheckedAt: LATER,
    });
  });
  it('ignores products and listings from other sets', async () => {
    const [p] = await db.insert(products).values({
      cardmarketId: 1, name: 'Other Box', kind: 'sealed', categoryName: 'Boxes',
      cardmarketExpansionId: 6601, setKey: 'other-set', updatedAt: NOW,
    }).returning();
    await db.insert(listings).values({
      marketplace: 'cardtrader', externalId: 'other', productId: p.id, title: 'x', url: 'https://x',
      priceCents: 1000, currency: 'EUR', language: 'en', firstSeenAt: NOW, lastSeenAt: NOW,
    });
    expect(await getFeedStats(db, SET.key)).toMatchObject({ listingsChecked: 0, productsTracked: 7, lastCheckedAt: null });
  });
  it('counts across all tracked sets for null', async () => {
    await ingestListings(db, fakeProvider('cardtrader', [makeListing()]), SET, NOW);
    const [p] = await db.insert(products).values({
      cardmarketId: 2, name: 'Jungle Box', kind: 'sealed', categoryName: 'Boxes',
      cardmarketExpansionId: 1525, setKey: JUNGLE.key, updatedAt: NOW,
    }).returning();
    await db.insert(listings).values({
      marketplace: 'cardtrader', externalId: 'jungle', productId: p.id, title: 'x', url: 'https://x',
      priceCents: 1000, currency: 'EUR', language: 'en', firstSeenAt: NOW, lastSeenAt: LATER,
    });
    await db.insert(products).values({
      cardmarketId: 3, name: 'Untracked', kind: 'sealed', categoryName: 'Boxes',
      cardmarketExpansionId: 1, setKey: 'untracked-set', updatedAt: NOW,
    });
    expect(await getFeedStats(db, null)).toMatchObject({ listingsChecked: 2, productsTracked: 8, lastCheckedAt: LATER });
  });
  it('returns zeros and nulls for an empty database', async () => {
    const empty = await createTestDb();
    expect(await getFeedStats(empty, SET.key)).toEqual({ listingsChecked: 0, productsTracked: 0, marketValuesAt: null, lastCheckedAt: null });
  });
});
