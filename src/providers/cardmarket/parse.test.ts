import { describe, it, expect } from 'vitest';
import { parseCatalog, parsePriceGuide, eurosToCents } from './parse';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { loadJson } from '../../../test/helpers/fixtures';

describe('Cardmarket parsing', () => {
  it('converts euros to cents and treats 0 as no data', () => {
    expect(eurosToCents(3160.53)).toBe(316053);
    expect(eurosToCents(0.05)).toBe(5);
    expect(eurosToCents(0)).toBeNull();
    expect(eurosToCents(null)).toBeNull();
    expect(eurosToCents(undefined)).toBeNull();
  });
  it('keeps only singles from the tracked expansion', () => {
    const ids = parseCatalog(loadJson('cardmarket/products_singles_6.json'), 'single', SET).map((p) => p.cardmarketId);
    expect(ids).toEqual([907607, 907672, 909509, 909510]);
  });
  it('keeps tracked sealed products and drops other expansions, coins and complete sets', () => {
    const products = parseCatalog(loadJson('cardmarket/products_nonsingles_6.json'), 'sealed', SET);
    expect(products.map((p) => p.cardmarketId)).toEqual([895551, 895553, 895559]);
    expect(products[0]).toEqual({ cardmarketId: 895551, name: '30th Celebration Elite Trainer Box', categoryName: 'Pokémon Elite Trainer Boxes', expansionId: 6601, kind: 'sealed' });
  });
  it('keeps same-name products distinct', () => {
    const mews = parseCatalog(loadJson('cardmarket/products_singles_6.json'), 'single', SET).filter((p) => p.name === 'Mew [Psychic | 30C]');
    expect(mews.map((p) => p.cardmarketId)).toEqual([907672, 909509, 909510]);
  });
  it('reads the price guide date and prices in cents', () => {
    const { capturedAt, byProductId } = parsePriceGuide(loadJson('cardmarket/price_guide_6.json'));
    expect(capturedAt.toISOString()).toBe('2026-10-19T00:42:46.000Z');
    expect(byProductId.get(909509)).toMatchObject({ trend: 316053, avg: 300979, low: 219900, avg1: 410000, avg7: 306574, avg30: 299938, trendHolo: null });
    expect(byProductId.get(895551)).toMatchObject({ trend: 13295, avg: 15045, avg7: null, avg30: null, trendHolo: null });
    expect(byProductId.get(273532)).toMatchObject({ trendHolo: 49, avg7Holo: 36, avg30Holo: 54, lowHolo: 20 });
  });
  it('accepts rows without holo fields', () => {
    expect(parsePriceGuide(loadJson('cardmarket/price_guide_6.json')).byProductId.get(908414))
      .toMatchObject({ trend: 317, avgHolo: null, trendHolo: null });
  });
  it('rejects a file that does not look like a price guide', () => {
    expect(() => parsePriceGuide({})).toThrow();
    expect(() => parseCatalog({ products: 'nope' }, 'single', SET)).toThrow();
  });
  it('rejects a catalogue missing version or createdAt', () => {
    expect(() => parseCatalog({ products: [] }, 'single', SET)).toThrow();
    expect(() => parseCatalog({ version: 1, products: [] }, 'single', SET)).toThrow();
  });
});
