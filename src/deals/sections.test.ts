import { describe, it, expect, beforeEach } from 'vitest';
import { getSectionRows, getSectionCounts, sealedTypeOf } from './sections';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { fxRates, products, usReferencePrices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
import { fakeProvider } from '../../test/helpers/fake-provider';
import { makeListing } from '../../test/fixtures/listings';

const NOW = new Date('2026-10-19T12:00:00Z');
const DAY = 24 * 3_600_000;
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
});
const seed = (...ls: Parameters<typeof makeListing>[0][]) =>
  ingestListings(db, fakeProvider('cardtrader', ls.map((l) => makeListing(l))), SET, NOW);
const sealed = (opts: { sealedType?: 'etb' } = {}) => getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW, ...opts });

async function etbId(): Promise<number> {
  const [p] = await db.select().from(products).where(eq(products.name, '30th Celebration Elite Trainer Box'));
  return p.id;
}
async function addUs(usdCents: number | null, capturedAt: Date) {
  await db.insert(usReferencePrices).values({
    productId: await etbId(), capturedAt, capturedDay: capturedAt.toISOString().slice(0, 10), usdCents,
  });
}

describe('sections', () => {
  it('maps Cardmarket categories to sealed types', () => {
    expect(sealedTypeOf('Pokémon Elite Trainer Boxes')).toBe('etb');
    expect(sealedTypeOf('Pokémon Display')).toBe('bundles-displays');
    expect(sealedTypeOf('Pokémon Theme Decks')).toBe('battle-decks');
    expect(sealedTypeOf('Something New')).toBe('other');
  });
  it('shows the cheapest EN/DE EUR offer and counts only EN/DE offers', async () => {
    await seed(
      { externalId: 'a', priceCents: 12000, language: 'de' },
      { externalId: 'b', priceCents: 9900, language: 'en' },
      { externalId: 'c', priceCents: 5000, language: 'it' },
    );
    const etb = (await sealed()).find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
    expect(etb.offer).toMatchObject({ priceCents: 9900, language: 'en' });
    expect(etb.offerCount).toBe(2);
    expect(etb.offer!.score.isDeal).toBe(true); // 9900 vs 13295 = 26% below
  });
  it('lists products without an EN/DE offer', async () => {
    const rows = await sealed();
    expect(rows.map((r) => r.productName)).toEqual([
      '30th Celebration Elite Trainer Box', '30th Celebration: Knock Out Collection', '30th Celebration Poster Collection',
    ]);
    expect(rows.every((r) => r.offer === null && r.offerCount === 0)).toBe(true);
  });
  it('filters sealed by type', async () => {
    expect((await sealed({ sealedType: 'etb' })).map((r) => r.sealedType)).toEqual(['etb']);
  });
  it('shows singles worth €5+ by default, sorted by market value', async () => {
    const ids = (await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW })).map((r) => r.productId);
    const all = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true });
    expect(ids).toHaveLength(2);
    expect(all).toHaveLength(4);
    expect(all[0].benchmark.valueCents).toBe(316053);
  });
  it('only uses Near Mint or Mint offers for singles', async () => {
    await seed(
      { externalId: 's1', cardmarketProductId: 909509, condition: 'slightly_played', priceCents: 100000, language: 'en' },
      { externalId: 's2', cardmarketProductId: 909509, condition: 'near_mint', priceCents: 250000, language: 'en' },
    );
    const mew = (await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW }))[0];
    expect(mew.offer).toMatchObject({ priceCents: 250000 });
    expect(mew.offerCount).toBe(1);
  });
  it('converts the US price with the newest rate', async () => {
    await db.insert(fxRates).values({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
    await addUs(12886, NOW);
    expect((await sealed())[0].us).toEqual({ usdCents: 12886, eurCents: 11480 });
  });
  it('hides US prices older than 7 days', async () => {
    await db.insert(fxRates).values({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
    await addUs(12886, new Date(NOW.getTime() - 8 * DAY));
    expect((await sealed())[0].us).toBeNull();
  });
  it('hides the US price when the exchange rate is older than 7 days', async () => {
    await db.insert(fxRates).values({ rateDate: '2026-10-10', usdPerEur: 1.1225 });
    await addUs(12886, NOW);
    expect((await sealed())[0].us).toBeNull();
  });
  it('falls back to an older price when the newest attempt found none', async () => {
    await db.insert(fxRates).values({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
    await addUs(12886, new Date(NOW.getTime() - DAY));
    await addUs(null, NOW);
    expect((await sealed())[0].us).toEqual({ usdCents: 12886, eurCents: 11480 });
  });
  it('counts singles worth €5+ and all sealed', async () => {
    expect(await getSectionCounts(db, SET.key)).toEqual({ singles: 2, sealed: 3 });
  });
});
