import { describe, it, expect, beforeEach } from 'vitest';
import { getDealFeed, getLastCheckedAt } from './feed';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { fakeProvider } from '../../test/helpers/fake-provider';
import { makeListing } from '../../test/fixtures/listings';
import { loadJson } from '../../test/helpers/fixtures';

const NOW = new Date('2026-10-19T12:00:00Z');
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
});
const seed = (...ls: Parameters<typeof makeListing>[0][]) =>
  ingestListings(db, fakeProvider('cardtrader', ls.map((l) => makeListing(l))), SET, NOW);

describe('getDealFeed', () => {
  it('returns a scored deal with market value and discount', async () => {
    await seed({});
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({ productName: '30th Celebration Elite Trainer Box', kind: 'sealed', priceCents: 9900 });
    expect(deal.benchmark).toMatchObject({ valueCents: 13295, confidence: 'high' });
    expect(deal.score).toMatchObject({ isDeal: true, discountCents: 3395, warnings: ['Shipping not included'] });
  });
  it('uses the latest market value', async () => {
    // An older day's guide, ingested *after* today's, with a very different ETB trend (€200).
    const guide = loadJson('cardmarket/price_guide_6.json') as { createdAt: string; priceGuides: { idProduct: number; trend: number | null }[] };
    const older = {
      ...guide,
      createdAt: '2026-10-18T02:40:00+0200',
      priceGuides: guide.priceGuides.map((g) => (g.idProduct === 895551 ? { ...g, trend: 200 } : g)),
    };
    await ingestCardmarket(db, { fetchJson: cardmarketFetch({ priceGuide: older }) }, SET);
    await seed({});
    expect((await getDealFeed(db, { now: NOW }))[0].benchmark.valueCents).toBe(13295);
  });
  it('hides non-deals unless asked', async () => {
    await seed({ priceCents: 12900 });
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
    const [all] = await getDealFeed(db, { now: NOW, includeNonDeals: true });
    expect(all.score.notDealReasons).toEqual(['Only 3% below market value (needs 20%)']);
  });
  it('excludes unavailable listings', async () => {
    await seed({});
    await ingestListings(db, fakeProvider('cardtrader', []), SET, new Date('2026-10-19T12:15:00Z'));
    expect(await getDealFeed(db, { now: NOW, includeNonDeals: true })).toEqual([]);
  });
  it('sorts by discount, biggest first', async () => {
    await seed({}, { externalId: 'ct-ko', cardmarketProductId: 895559, title: 'Knock Out', priceCents: 2500 });
    const feed = await getDealFeed(db, { now: NOW });
    expect(feed.map((d) => d.productName)).toEqual(['30th Celebration: Knock Out Collection', '30th Celebration Elite Trainer Box']);
  });
  it('marks a product without a snapshot as insufficient', async () => {
    const [p] = await db.insert(products).values({
      cardmarketId: 1, name: 'No Data Box', kind: 'sealed', categoryName: 'Boxes',
      cardmarketExpansionId: 6601, setKey: 'test', updatedAt: NOW,
    }).returning();
    await db.insert(listings).values({
      marketplace: 'cardtrader', externalId: 'nodata', productId: p.id, title: 'x', url: 'https://x',
      priceCents: 1000, currency: 'EUR', language: 'en', firstSeenAt: NOW, lastSeenAt: NOW,
    });
    const [deal] = await getDealFeed(db, { now: NOW, includeNonDeals: true });
    expect(deal.benchmark.confidence).toBe('insufficient');
    expect(deal.score.notDealReasons).toEqual(['Not enough sales data']);
  });
  it('reports when listings were last checked', async () => {
    expect(await getLastCheckedAt(db)).toBeNull();
    await seed({});
    expect(await getLastCheckedAt(db)).toEqual(NOW);
  });
});
