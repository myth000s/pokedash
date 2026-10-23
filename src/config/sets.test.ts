import { describe, it, expect } from 'vitest';
import { TRACKED_SETS, THIRTIETH_CELEBRATION, findSet } from './sets';
import { dealConditionsFor } from './settings';

describe('tracked sets', () => {
  it('has 16 sets with unique keys', () => {
    expect(TRACKED_SETS).toHaveLength(16);
    expect(new Set(TRACKED_SETS.map((s) => s.key)).size).toBe(16);
  });
  it('maps Base Set to both CardTrader expansions and one Cardmarket expansion', () => {
    const base = findSet('base-set');
    expect(base).toMatchObject({
      cardtraderExpansionIds: [1472, 1969], shadowlessExpansionId: 1969, cardmarketExpansionIds: [1523],
      hasFirstEdition: true, era: 'vintage',
    });
  });
  it('knows which sets have a 1st Edition', () => {
    expect(findSet('base-set-2')?.hasFirstEdition).toBe(false);
    expect(findSet('skyridge')?.hasFirstEdition).toBe(false);
    expect(findSet('neo-destiny')?.hasFirstEdition).toBe(true);
  });
  it('only 30th Celebration has US prices', () => {
    expect(TRACKED_SETS.filter((s) => s.usPrices).map((s) => s.key)).toEqual(['30th-celebration']);
    expect(THIRTIETH_CELEBRATION.era).toBe('modern');
  });
  it('findSet returns undefined for unknown keys', () => {
    expect(findSet('nope')).toBeUndefined();
  });
  it('widens deal conditions for vintage sets only', () => {
    expect(dealConditionsFor(findSet('base-set')!)).toContain('moderately_played');
    expect(dealConditionsFor(THIRTIETH_CELEBRATION)).toEqual(['mint', 'near_mint']);
  });
});
