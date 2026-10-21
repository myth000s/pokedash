import { describe, expect, it } from 'vitest';
import { clearFiltersHref, dashboardHref, hasActiveFilters, parseDashboardParams as parse } from './params';

const base = { q: '', lang: null, kind: null, minPct: null, maxPriceCents: null };

describe('parseDashboardParams', () => {
  it('reads the tab, the singles switch and the sealed type', () => {
    expect(parse({ tab: 'singles', all: '1' })).toEqual({ ...base, tab: 'singles', allSingles: true, sealedType: null });
    expect(parse({ tab: 'sealed', type: 'etb' })).toEqual({ ...base, tab: 'sealed', allSingles: false, sealedType: 'etb' });
  });
  it('falls back to defaults for unknown parameters', () => {
    expect(parse({})).toEqual({ ...base, tab: 'deals', allSingles: false, sealedType: null });
    expect(parse({ tab: 'slabs', type: 'nope', all: ['1', '2'] })).toEqual({ ...base, tab: 'deals', allSingles: false, sealedType: null });
  });
  it('reads the filter params', () => {
    const p = parse({ q: '  pika  ', lang: 'de', kind: 'sealed', min: '40', max: '120' });
    expect(p).toMatchObject({ q: 'pika', lang: 'de', kind: 'sealed', minPct: 40, maxPriceCents: 12000 });
  });
  it('caps q at 100 chars and ignores repeated q', () => {
    expect(parse({ q: 'a'.repeat(10000) }).q).toHaveLength(100);
    expect(parse({ q: ['a', 'b'] }).q).toBe('');
  });
  it('ignores invalid filter values', () => {
    for (const max of ['abc', '-5', '0', '1e9', '100001', '12.5']) {
      expect(parse({ max }).maxPriceCents).toBeNull();
    }
    expect(parse({ min: '25' }).minPct).toBeNull();
    expect(parse({ lang: 'it' }).lang).toBeNull();
    expect(parse({ kind: 'slab' }).kind).toBeNull();
  });
});

describe('links', () => {
  it('drops params that do not apply to the target tab', () => {
    expect(dashboardHref(parse({ tab: 'deals', q: 'pika', min: '40' }), { tab: 'singles' })).toBe('?tab=singles&q=pika');
  });
  it('keeps a stable order of non-default params', () => {
    expect(dashboardHref(parse({ tab: 'sealed', type: 'etb', lang: 'en' }))).toBe('?tab=sealed&lang=en&type=etb');
  });
  it('url-encodes q', () => {
    expect(dashboardHref(parse({ q: 'a b&c' }))).toBe('?tab=deals&q=a%20b%26c');
  });
  it('clearFiltersHref keeps tab, all and type', () => {
    expect(clearFiltersHref(parse({ tab: 'singles', all: '1', q: 'x', lang: 'de' }))).toBe('?tab=singles&all=1');
  });
  it('hasActiveFilters ignores all and type', () => {
    expect(hasActiveFilters(parse({ tab: 'singles', all: '1' }))).toBe(false);
    expect(hasActiveFilters(parse({ min: '30' }))).toBe(true);
  });
});
