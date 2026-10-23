import { describe, it, expect } from 'vitest';
import { cheapestReference, conditionGroup, referenceValues, type PoolListing } from './reference';

const NOW = new Date('2026-10-23T12:00:00Z');
let nextId = 1;
const L = (over: Partial<PoolListing> = {}): PoolListing => ({
  id: nextId++, productId: 1, edition: 'unlimited', condition: 'near_mint', isReverseHolo: false,
  priceCents: 1000, language: 'en', currency: 'EUR', available: true, lastSeenAt: NOW, ...over,
});
const nm = (...prices: number[]) => prices.map((priceCents) => L({ priceCents }));

describe('conditionGroup', () => {
  it('groups conditions', () => {
    expect(conditionGroup('mint')).toBe('nm');
    expect(conditionGroup('near_mint')).toBe('nm');
    expect(conditionGroup('slightly_played')).toBe('sp');
    expect(conditionGroup('moderately_played')).toBe('mp');
    expect(conditionGroup('played')).toBeNull();
    expect(conditionGroup('poor')).toBeNull();
    expect(conditionGroup(null)).toBeNull();
  });
});

describe('referenceValues', () => {
  it('uses the second-cheapest other listing', () => {
    const pool = nm(8664, 9004, 9198, 9260);
    const ref = referenceValues(pool, NOW, 72);
    expect(ref.get(pool[0].id)).toBe(9198);
    expect(ref.get(pool[1].id)).toBe(9198);
    expect(ref.get(pool[2].id)).toBe(9004);
    expect(ref.get(pool[3].id)).toBe(9004);
  });
  it('gives null to a group of exactly 3', () => {
    const pool = nm(1000, 1100, 1200);
    const ref = referenceValues(pool, NOW, 72);
    expect(pool.map((l) => ref.get(l.id))).toEqual([null, null, null]);
  });
  it('handles ties', () => {
    const pool = nm(1000, 1000, 1000, 1000);
    const ref = referenceValues(pool, NOW, 72);
    expect(pool.map((l) => ref.get(l.id))).toEqual([1000, 1000, 1000, 1000]);
  });
  it('keeps condition groups apart', () => {
    const pool = [...nm(1000, 1100, 1200, 1300), L({ condition: 'slightly_played', priceCents: 500 })];
    const ref = referenceValues(pool, NOW, 72);
    expect(ref.get(pool[0].id)).toBe(1200);
    expect(ref.get(pool[4].id)).toBeNull();
  });
  it('ignores stale listings and gives them no reference', () => {
    const stale = L({ priceCents: 1000, lastSeenAt: new Date(NOW.getTime() - 4 * 86_400_000) });
    const pool = [...nm(2000, 2100, 2200, 2300), stale];
    const ref = referenceValues(pool, NOW, 72);
    expect(ref.get(pool[0].id)).toBe(2200);
    expect(ref.has(stale.id)).toBe(false);
  });
  it('never mixes reverse holo, editions or products', () => {
    const pool = [
      ...nm(1000, 1100, 1200, 1300),
      L({ isReverseHolo: true, priceCents: 100 }),
      L({ edition: 'first_edition', priceCents: 100 }),
      L({ productId: 2, priceCents: 100 }),
    ];
    const ref = referenceValues(pool, NOW, 72);
    expect(ref.get(pool[0].id)).toBe(1200);
    expect(ref.get(pool[4].id)).toBeNull();
    expect(ref.get(pool[5].id)).toBeNull();
    expect(ref.get(pool[6].id)).toBeNull();
  });
  it('ignores Italian, USD and unavailable listings', () => {
    const odd = [L({ language: 'it', priceCents: 100 }), L({ currency: 'USD', priceCents: 100 }), L({ available: false, priceCents: 100 })];
    const pool = [...nm(1000, 1100, 1200, 1300), ...odd];
    const ref = referenceValues(pool, NOW, 72);
    expect(ref.get(pool[0].id)).toBe(1200);
    for (const o of odd) expect(ref.has(o.id)).toBe(false);
  });
});

describe('referenceValues at scale', () => {
  it('handles a group of 2,000 quickly and exactly', () => {
    const pool = nm(...Array.from({ length: 2000 }, (_, i) => 1000 + i));
    const t0 = performance.now();
    const ref = referenceValues(pool, NOW, 72);
    expect(performance.now() - t0).toBeLessThan(200);
    expect([0, 1, 2, 1999].map((i) => ref.get(pool[i].id))).toEqual([1002, 1002, 1001, 1001]);
  });
});

describe('cheapestReference', () => {
  it('is the middle of the 3 cheapest', () => {
    expect(cheapestReference([5, 1, 3])).toBe(3);
    expect(cheapestReference([9, 1, 3, 2])).toBe(2);
  });
  it('is null under 3 prices', () => {
    expect(cheapestReference([1, 2])).toBeNull();
  });
});
