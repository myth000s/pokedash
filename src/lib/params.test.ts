import { describe, expect, it } from 'vitest';
import { parseDashboardParams } from './params';

describe('parseDashboardParams', () => {
  it('reads the tab, the singles switch and the sealed type', () => {
    expect(parseDashboardParams({ tab: 'singles', all: '1' })).toEqual({ tab: 'singles', allSingles: true, sealedType: null });
    expect(parseDashboardParams({ tab: 'sealed', type: 'etb' })).toEqual({ tab: 'sealed', allSingles: false, sealedType: 'etb' });
  });
  it('falls back to defaults for unknown parameters', () => {
    expect(parseDashboardParams({})).toEqual({ tab: 'deals', allSingles: false, sealedType: null });
    expect(parseDashboardParams({ tab: 'slabs', type: 'nope', all: ['1', '2'] })).toEqual({ tab: 'deals', allSingles: false, sealedType: null });
  });
});
