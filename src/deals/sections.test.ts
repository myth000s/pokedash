import { describe, it, expect, beforeEach } from 'vitest';
import { getSectionRows, getSectionCounts, getAvailableRarities, sealedTypeOf, sortRows, type SectionRow } from './sections';
import { ingestCardmarket } from '@/ingest/cardmarket';
import { ingestListings } from '@/ingest/listings';
import { THIRTIETH_CELEBRATION as SET, JUNGLE } from '@/config/sets';
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
const sealed = (opts: { sealedType?: 'etb'; query?: string; language?: 'en' | 'de' } = {}) => getSectionRows(db, { section: 'sealed', setKey: SET.key, now: NOW, ...opts });

type ListingOver = Parameters<typeof makeListing>[0];
/** A Near Mint EN offer on the Mew single (cardmarket id 909509); the id is unique per price and overrides. */
const mewNm = (priceCents: number, over: ListingOver = {}): ListingOver => ({
  externalId: `mew-${priceCents}-${JSON.stringify(over)}`, cardmarketProductId: 909509, condition: 'near_mint', priceCents, language: 'en', ...over,
});
const MEW = 909509;
const mewRow = async (opts: { edition?: 'unlimited' | 'first_edition'; conditionGroup?: 'nm' | 'sp' | 'mp'; language?: 'en' | 'de'; now?: Date } = {}) =>
  (await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true, ...opts })).find((r) => r.cardmarketProductId === MEW)!;

async function etbId(): Promise<number> {
  const [p] = await db.select().from(products).where(eq(products.name, '30th Celebration Elite Trainer Box'));
  return p.id;
}
async function addUs(usdCents: number | null, capturedAt: Date) {
  await db.update(products).set({ tcgplayerId: 704143 }).where(eq(products.id, await etbId()));
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
    expect(etb.benchmark.valueCents).toBeNull(); // only 2 offers: too few to value
  });
  it('values sealed products from their own EN/DE offers (condition-less counts as Near Mint)', async () => {
    await seed(
      { externalId: 'a', priceCents: 12000, language: 'de' },
      { externalId: 'b', priceCents: 9900, language: 'en' },
      { externalId: 'c', priceCents: 11000, language: 'en' },
    );
    const etb = (await sealed()).find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
    expect(etb.benchmark).toMatchObject({ valueCents: 11000, basis: 'en_de_offers', confidence: 'high' });
    expect(etb.offer!.score.discountCents).toBe(1100);
  });
  it('lists products without an EN/DE offer', async () => {
    const rows = await sealed();
    expect(rows.map((r) => r.productName)).toEqual([
      '30th Celebration Elite Trainer Box', '30th Celebration Poster Collection', '30th Celebration: Knock Out Collection', // no values, so by name
    ]);
    expect(rows.every((r) => r.offer === null && r.offerCount === 0)).toBe(true);
  });
  it('filters rows by name query', async () => {
    const rows = await sealed({ query: 'knock out' });
    expect(rows.map((r) => r.productName)).toEqual(['30th Celebration: Knock Out Collection']);
    const singles = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true, query: 'MEW' });
    expect(singles.map((r) => r.productName)).toEqual(Array(3).fill('Mew [Psychic | 30C]'));
  });
  it('picks the cheapest offer in the chosen language even if another language is cheaper', async () => {
    await seed(
      { externalId: 'a', priceCents: 12000, language: 'de' },
      { externalId: 'b', priceCents: 9900, language: 'en' },
    );
    const etb = (await sealed({ language: 'de' })).find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
    expect(etb.offer).toMatchObject({ priceCents: 12000, language: 'de' });
    expect(etb.offerCount).toBe(1);
  });
  it('keeps products without an offer in the chosen language, with no offer', async () => {
    await seed({ externalId: 'b', priceCents: 9900, language: 'en' });
    const rows = await sealed({ language: 'de' });
    const etb = rows.find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
    expect(etb.offer).toBeNull();
    expect(etb.offerCount).toBe(0);
    expect(rows).toHaveLength(3);
  });
  it('filters sealed by type', async () => {
    expect((await sealed({ sealedType: 'etb' })).map((r) => r.sealedType)).toEqual(['etb']);
  });
  it('shows singles worth €5+ by value from EN/DE offers, sorted by that value', async () => {
    await seed(mewNm(100000), mewNm(120000), mewNm(130000));
    const rows = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].benchmark).toMatchObject({ valueCents: 120000, basis: 'en_de_offers', confidence: 'high' });
    const all = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true });
    expect(all).toHaveLength(4);
    expect(all[0].productId).toBe(rows[0].productId);
    expect(all[1].benchmark).toMatchObject({ valueCents: null, confidence: 'insufficient' });
  });
  it('carries the Cardmarket trend as a note, plus rarity, edition and Cardmarket id', async () => {
    const mew = await mewRow();
    expect(mew.cardmarketValueCents).toBe(316053);
    expect(mew).toMatchObject({ rarity: null, edition: 'unlimited', cardmarketProductId: MEW });
  });
  it('only uses Near Mint or Mint offers for singles by default', async () => {
    await seed(
      { externalId: 's1', cardmarketProductId: MEW, condition: 'slightly_played', priceCents: 100000, language: 'en' },
      { externalId: 's2', cardmarketProductId: MEW, condition: 'near_mint', priceCents: 250000, language: 'en' },
    );
    const mew = await mewRow();
    expect(mew.offer).toMatchObject({ priceCents: 250000 });
    expect(mew.offerCount).toBe(1);
  });
  it('skips reverse-holo offers when picking the singles offer', async () => {
    await seed(
      { externalId: 'r1', cardmarketProductId: MEW, condition: 'near_mint', isReverseHolo: true, priceCents: 200000, language: 'en' },
      { externalId: 'n1', cardmarketProductId: MEW, condition: 'near_mint', isReverseHolo: false, priceCents: 250000, language: 'en' },
    );
    const mew = await mewRow();
    expect(mew.offer).toMatchObject({ priceCents: 250000 });
    expect(mew.offerCount).toBe(2);
  });
  it('ignores unavailable offers', async () => {
    await seed({ externalId: 'a', priceCents: 5000, language: 'en' }, { externalId: 'b', priceCents: 9900, language: 'en' });
    // a later run no longer lists 'a', so it is marked unavailable
    await ingestListings(db, fakeProvider('cardtrader', [makeListing({ externalId: 'b', priceCents: 9900, language: 'en' })]), SET, new Date(NOW.getTime() + 60_000));
    const etb = (await sealed()).find((r) => r.productName === '30th Celebration Elite Trainer Box')!;
    expect(etb.offer).toMatchObject({ priceCents: 9900 });
    expect(etb.offerCount).toBe(1);
  });
  it('hides the US price for a product without a TCGplayer id', async () => {
    await db.insert(fxRates).values({ rateDate: '2026-10-19', usdPerEur: 1.1225 });
    await addUs(12886, NOW);
    await db.update(products).set({ tcgplayerId: null }).where(eq(products.id, await etbId()));
    expect((await sealed())[0].us).toBeNull();
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
    expect(await getSectionCounts(db, SET.key, NOW)).toEqual({ singles: 0, sealed: 3 });
    await seed(mewNm(100000), mewNm(120000), mewNm(130000));
    expect(await getSectionCounts(db, SET.key, NOW)).toEqual({ singles: 1, sealed: 3 });
  });
  it('getSectionCounts matches the singles rows, and null counts across tracked sets', async () => {
    await seed(mewNm(100000), mewNm(120000), mewNm(130000));
    const rows = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW });
    expect((await getSectionCounts(db, SET.key, NOW)).singles).toBe(rows.length);
    expect(await getSectionCounts(db, null, NOW)).toEqual({ singles: rows.length, sealed: 3 });
  });

  describe('edition, condition, rarity', () => {
    it('values each edition from its own offers', async () => {
      await seed(
        mewNm(100000), mewNm(110000), mewNm(120000), mewNm(130000),
        mewNm(900000, { edition: 'first_edition' }), mewNm(910000, { edition: 'first_edition' }), mewNm(920000, { edition: 'first_edition' }),
      );
      const unl = await mewRow({ edition: 'unlimited' });
      expect(unl.benchmark.valueCents).toBe(110000);
      expect(unl.edition).toBe('unlimited');
      expect(unl.offer).toMatchObject({ priceCents: 100000 });
      expect((await mewRow()).benchmark.valueCents).toBe(110000);
      const first = await mewRow({ edition: 'first_edition' });
      expect(first.benchmark.valueCents).toBe(910000);
      expect(first.edition).toBe('first_edition');
      expect(first.offer).toMatchObject({ priceCents: 900000 });
    });
    it('returns a null value when an edition has fewer than 3 offers', async () => {
      await seed(mewNm(100000), mewNm(110000), mewNm(120000), mewNm(900000, { edition: 'first_edition' }), mewNm(910000, { edition: 'first_edition' }));
      expect((await mewRow({ edition: 'first_edition' })).benchmark).toMatchObject({ valueCents: null, confidence: 'insufficient' });
    });
    it('values the chosen condition group from its offers only', async () => {
      await seed(
        mewNm(100000), mewNm(110000), mewNm(120000),
        mewNm(60000, { condition: 'slightly_played' }), mewNm(65000, { condition: 'slightly_played' }), mewNm(70000, { condition: 'slightly_played' }),
      );
      const sp = await mewRow({ conditionGroup: 'sp' });
      expect(sp.benchmark.valueCents).toBe(65000);
      expect(sp.offer).toMatchObject({ priceCents: 60000 });
      expect(sp.offerCount).toBe(3);
      expect((await mewRow({ conditionGroup: 'nm' })).benchmark.valueCents).toBe(110000);
      expect((await mewRow({ conditionGroup: 'mp' })).offer).toBeNull();
    });
    it('narrows the value to the chosen language', async () => {
      await seed(mewNm(100000), mewNm(110000), mewNm(120000), mewNm(50000, { language: 'de' }));
      expect((await mewRow()).benchmark.valueCents).toBe(100000);
      expect((await mewRow({ language: 'en' })).benchmark.valueCents).toBe(110000);
      expect((await mewRow({ language: 'de' })).benchmark.valueCents).toBeNull();
    });
    it('ignores stale offers when valuing', async () => {
      await seed(mewNm(100000), mewNm(110000), mewNm(120000));
      expect((await mewRow({ now: new Date(NOW.getTime() + 80 * 3_600_000) })).benchmark.valueCents).toBeNull();
    });
    it('filters singles by rarity, with No rarity matching null', async () => {
      const [mew] = await db.select().from(products).where(eq(products.cardmarketId, MEW));
      await db.update(products).set({ rarity: 'Holo Rare' }).where(eq(products.id, mew.id));
      const holo = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true, rarities: ['Holo Rare'] });
      expect(holo.map((r) => r.productId)).toEqual([mew.id]);
      expect(holo[0].rarity).toBe('Holo Rare');
      const none = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true, rarities: ['No rarity'] });
      expect(none).toHaveLength(3);
      expect(none.every((r) => r.rarity === null)).toBe(true);
      const both = await getSectionRows(db, { section: 'singles', setKey: SET.key, now: NOW, allSingles: true, rarities: ['Holo Rare', 'No rarity'] });
      expect(both).toHaveLength(4);
    });
    it('lists available rarities sorted, No rarity last', async () => {
      const singles = await db.select().from(products).where(eq(products.kind, 'single'));
      await db.update(products).set({ rarity: 'Rare' }).where(eq(products.id, singles[0].id));
      await db.update(products).set({ rarity: 'Common' }).where(eq(products.id, singles[1].id));
      expect(await getAvailableRarities(db, SET.key)).toEqual(['Common', 'Rare', 'No rarity']);
      await db.update(products).set({ rarity: 'Uncommon' }).where(eq(products.kind, 'single'));
      expect(await getAvailableRarities(db, SET.key)).toEqual(['Uncommon']);
      expect(await getAvailableRarities(db, JUNGLE.key)).toEqual([]);
    });
  });

  describe('sortRows', () => {
    const row = (name: string, price: number | null, value: number | null): SectionRow => ({
      productId: 0, productName: name, kind: 'single', sealedType: null, imageUrl: null,
      benchmark: { valueCents: value, basis: 'en_de_offers', confidence: 'high', reasons: [], capturedAt: NOW },
      us: null, cardmarketValueCents: null, rarity: null, edition: 'unlimited', cardmarketProductId: 0, offerCount: 0,
      offer: price === null ? null : {
        listingId: 0, url: '', priceCents: price, language: 'en', sellerCountry: null,
        score: {
          deliveredCents: price, shippingKnown: false, discountCents: value === null ? null : value - price,
          discountPct: value === null ? null : (value - price) / value, isDeal: false, warnings: [], notDealReasons: [],
        },
      },
    });
    const rows = [row('none', null, 500), row('b', 200, 1000), row('a', 300, 310), row('c', 100, null), row('d', 400, 800)];
    const names = (sort: Parameters<typeof sortRows>[1]) => sortRows(rows, sort).map((r) => r.productName);
    it('cheapest first, no offer last', () => expect(names('cheapest')).toEqual(['c', 'b', 'a', 'd', 'none']));
    it('most expensive first, no offer last', () => expect(names('expensive')).toEqual(['d', 'a', 'b', 'c', 'none']));
    it('largest saving first, no offer or value last', () => expect(names('saving')).toEqual(['b', 'd', 'a', 'c', 'none']));
    it('defaults to market value, highest first', () => expect(names(undefined)).toEqual(['b', 'd', 'none', 'a', 'c']));
    it('does not mutate its input', () => { const copy = [...rows]; sortRows(rows, 'cheapest'); expect(rows).toEqual(copy); });
  });
});
