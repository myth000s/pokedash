import { describe, it, expect } from 'vitest';
import { filterDeals, type DealFilters } from './filters';
import type { DealView } from './feed';

const NOW = new Date('2026-10-19T12:00:00Z');
const deal = (over: Partial<DealView> & { pct?: number } = {}): DealView => {
  const { pct = 0.25, ...rest } = over;
  return {
    listingId: 1, productName: '30th Celebration Elite Trainer Box', kind: 'sealed', marketplace: 'cardtrader',
    url: 'https://www.cardtrader.com/cards/1', condition: null, language: 'de', isReverseHolo: false, sellerCountry: 'DE', imageUrl: null,
    priceCents: 9900, shippingCents: null, currency: 'EUR', lastSeenAt: NOW,
    benchmark: { valueCents: 13295, basis: 'trend', confidence: 'high', reasons: [], capturedAt: NOW },
    score: { deliveredCents: 9900, shippingKnown: false, discountCents: 3395, discountPct: pct, isDeal: true, warnings: [], notDealReasons: [] },
    ...rest,
  };
};
const none: DealFilters = { q: '', lang: null, kind: null, minPct: null, maxPriceCents: null };

const etb = deal({ listingId: 1 });
const pika = deal({ listingId: 2, productName: 'Pikachu (25th Anniversary)', kind: 'single', language: 'en', priceCents: 500, pct: 0.35 });
const mew = deal({ listingId: 3, productName: 'Mew ex', kind: 'single', language: 'de', priceCents: 20000, pct: 0.5 });
const all = [etb, pika, mew];
const ids = (ds: DealView[]) => ds.map((d) => d.listingId);

describe('filterDeals', () => {
  it('returns everything for an empty filter', () => {
    expect(filterDeals(all, none)).toEqual(all);
  });
  it('filters by name query', () => {
    expect(ids(filterDeals(all, { ...none, q: 'pika 25' }))).toEqual([2]);
  });
  it('filters by language', () => {
    expect(ids(filterDeals(all, { ...none, lang: 'de' }))).toEqual([1, 3]);
  });
  it('filters by kind', () => {
    expect(ids(filterDeals(all, { ...none, kind: 'single' }))).toEqual([2, 3]);
  });
  it('compares the rounded percent shown on the tile', () => {
    const a = deal({ listingId: 7, pct: 0.296 });
    const b = deal({ listingId: 8, pct: 0.294 });
    expect(ids(filterDeals([a, b], { ...none, minPct: 30 }))).toEqual([7]);
  });
  it('filters by minimum saving, inclusive', () => {
    expect(ids(filterDeals(all, { ...none, minPct: 35 }))).toEqual([2, 3]);
    expect(ids(filterDeals(all, { ...none, minPct: 50 }))).toEqual([3]);
  });
  it('filters by maximum price, inclusive', () => {
    expect(ids(filterDeals(all, { ...none, maxPriceCents: 9900 }))).toEqual([1, 2]);
  });
  it('combines all five filters', () => {
    expect(ids(filterDeals(all, { q: 'mew', lang: 'de', kind: 'single', minPct: 40, maxPriceCents: 25000 }))).toEqual([3]);
    expect(filterDeals(all, { q: 'mew', lang: 'en', kind: 'single', minPct: 40, maxPriceCents: 25000 })).toEqual([]);
  });
  it('keeps order and does not mutate the input', () => {
    const input = [mew, etb, pika];
    const copy = [...input];
    expect(ids(filterDeals(input, { ...none, kind: 'single' }))).toEqual([3, 2]);
    expect(input).toEqual(copy);
  });
});
