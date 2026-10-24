import { describe, it, expect, beforeEach } from 'vitest';
import { getDealFeed, getLastCheckedAt } from './feed';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { benchmarkSnapshots, listings, products } from '@/db/schema';
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

// The ETB at 9900 plus three dearer offers: the 9900 offer's reference is the second-cheapest other (12500).
const seedEtb = (cheap: Parameters<typeof makeListing>[0] = {}) =>
  seed(
    cheap,
    { externalId: 'ct-b1', priceCents: 12000 },
    { externalId: 'ct-b2', priceCents: 12500 },
    { externalId: 'ct-b3', priceCents: 13000 },
  );

async function addProduct(setKey: string, cardmarketId: number, kind: 'single' | 'sealed' = 'single') {
  const [p] = await db.insert(products).values({
    cardmarketId, name: `Card ${cardmarketId}`, kind, categoryName: 'Cards',
    cardmarketExpansionId: 1, setKey, rarity: 'Rare', updatedAt: NOW,
  }).returning();
  return p;
}
async function addOffers(productId: number, prices: number[], over: Partial<typeof listings.$inferInsert> = {}) {
  await db.insert(listings).values(prices.map((priceCents, i) => ({
    marketplace: 'cardtrader', externalId: `o-${productId}-${over.condition ?? 'x'}-${i}`, productId, title: 'x',
    url: 'https://x', priceCents, currency: 'EUR', language: 'en', condition: 'near_mint',
    firstSeenAt: NOW, lastSeenAt: NOW, ...over,
  })));
}

describe('getDealFeed', () => {
  it('passes the picture link through', async () => {
    await seedEtb({ imageUrl: 'https://www.cardtrader.com/uploads/etb.jpg' });
    expect((await getDealFeed(db, { now: NOW }))[0].imageUrl).toBe('https://www.cardtrader.com/uploads/etb.jpg');
  });
  it('returns a scored deal with market value and discount', async () => {
    await seedEtb();
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({ productName: '30th Celebration Elite Trainer Box', kind: 'sealed', priceCents: 9900 });
    expect(deal.benchmark).toMatchObject({ valueCents: 12500, basis: 'en_de_offers', confidence: 'high' });
    expect(deal.score).toMatchObject({ isDeal: true, discountCents: 2600, warnings: ['Shipping not included'] });
  });
  it('keeps the latest Cardmarket value as a note', async () => {
    // An older day's guide, ingested *after* today's, with a very different ETB trend (€200).
    const guide = loadJson('cardmarket/price_guide_6.json') as { createdAt: string; priceGuides: { idProduct: number; trend: number | null }[] };
    const older = {
      ...guide,
      createdAt: '2026-10-18T02:40:00+0200',
      priceGuides: guide.priceGuides.map((g) => (g.idProduct === 895551 ? { ...g, trend: 200 } : g)),
    };
    await ingestCardmarket(db, { fetchJson: cardmarketFetch({ priceGuide: older }) }, SET);
    await seedEtb();
    expect((await getDealFeed(db, { now: NOW }))[0].cardmarketValueCents).toBe(13295);
  });
  it('hides non-deals', async () => {
    await seed(
      { priceCents: 12900 }, { externalId: 'ct-b1', priceCents: 13000 },
      { externalId: 'ct-b2', priceCents: 13100 }, { externalId: 'ct-b3', priceCents: 13200 },
    );
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
  });
  it('excludes unavailable listings', async () => {
    await seedEtb();
    expect(await getDealFeed(db, { now: NOW })).toHaveLength(1);
    await ingestListings(db, fakeProvider('cardtrader', []), SET, new Date('2026-10-19T12:15:00Z'));
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
  });
  it('narrows the feed to one set', async () => {
    await seedEtb();
    const p = await addProduct('base-set', 7010);
    await addOffers(p.id, [7900, 10000, 10000, 10000]);
    expect((await getDealFeed(db, { now: NOW })).map((d) => d.setKey).sort()).toEqual(['30th-celebration', 'base-set']);
    expect((await getDealFeed(db, { now: NOW, setKey: 'base-set' })).map((d) => d.setKey)).toEqual(['base-set']);
    expect(await getDealFeed(db, { now: NOW, setKey: 'jungle' })).toEqual([]);
  });
  it('sorts by euro saving, biggest first', async () => {
    // ETB saves €26.00 (21%); Knock Out saves €11.00 (31%): € saving wins.
    await seedEtb();
    await seed(
      { externalId: 'ct-ko', cardmarketProductId: 895559, priceCents: 2500 },
      { externalId: 'ct-ko1', cardmarketProductId: 895559, priceCents: 3500 },
      { externalId: 'ct-ko2', cardmarketProductId: 895559, priceCents: 3600 },
      { externalId: 'ct-ko3', cardmarketProductId: 895559, priceCents: 3700 },
    );
    const feed = await getDealFeed(db, { now: NOW });
    expect(feed.map((d) => d.productName)).toEqual(['30th Celebration Elite Trainer Box', '30th Celebration: Knock Out Collection']);
  });
  it('does not offer a product with too few offers, however cheap', async () => {
    const p = await addProduct('30th-celebration', 7011, 'sealed');
    // 3 offers: the cheap one has only 2 others to compare with.
    await addOffers(p.id, [1000, 10000, 10000], { condition: null });
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
    await addOffers(p.id, [10000], { condition: null, externalId: 'fourth' });
    expect(await getDealFeed(db, { now: NOW })).toMatchObject([{ priceCents: 1000, benchmark: { valueCents: 10000 }, cardmarketValueCents: null }]);
  });
  it('does not offer a listing that was last seen more than 3 days ago as a deal', async () => {
    await seedEtb();
    expect(await getDealFeed(db, { now: new Date(NOW.getTime() + 72 * 3_600_000) })).toHaveLength(1);
    expect(await getDealFeed(db, { now: new Date(NOW.getTime() + 72 * 3_600_000 + 1) })).toEqual([]);
  });
  it('reports when listings were last checked', async () => {
    expect(await getLastCheckedAt(db)).toBeNull();
    await seed({});
    expect(await getLastCheckedAt(db)).toEqual(NOW);
  });

  it('offers a modern Near Mint listing 20% below its reference', async () => {
    const p = await addProduct('30th-celebration', 7001);
    await addOffers(p.id, [7900, 10000, 10000, 10000]);
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({ priceCents: 7900, benchmark: { valueCents: 10000 } });
  });
  it('does not offer a modern Slightly Played listing, however cheap', async () => {
    const p = await addProduct('30th-celebration', 7002);
    await addOffers(p.id, [5000, 10000, 10000, 10000], { condition: 'slightly_played' });
    expect(await getDealFeed(db, { now: NOW })).toEqual([]);
  });
  it('offers a vintage Moderately Played listing 30% below its MP reference', async () => {
    const p = await addProduct('base-set', 7003);
    await addOffers(p.id, [7000, 10000, 10000, 10000], { condition: 'moderately_played' });
    // A cheap NM offer in the same product must not change the MP reference.
    await addOffers(p.id, [1000], { condition: 'near_mint' });
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({ priceCents: 7000, condition: 'moderately_played', benchmark: { valueCents: 10000 } });
  });
  it('carries edition, rarity, set and the Cardmarket value', async () => {
    const p = await addProduct('base-set', 7004);
    await db.insert(benchmarkSnapshots).values({ productId: p.id, capturedAt: NOW, trendCents: 1234, trendHoloCents: 4321 });
    await addOffers(p.id, [7900, 10000, 10000, 10000], { edition: 'first_edition', rarity: 'Rare Holo' });
    const [deal] = await getDealFeed(db, { now: NOW });
    expect(deal).toMatchObject({
      edition: 'first_edition', rarity: 'Rare Holo', setKey: 'base-set', cardmarketValueCents: 1234, cardmarketProductId: 7004,
    });
  });
});
