import { describe, expect, it } from 'vitest';
import { clearFiltersHref, dashboardHref, hasActiveFilters, parseDashboardParams as parse } from './params';
import { matchesQuery } from './search';

const base = { q: '', lang: null, kind: null, minPct: null, maxPriceCents: null, set: null, edition: null, condition: null, rarities: [], sort: null };

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
  it('truncates q by code point and never yields lone surrogates', () => {
    const p = parse({ q: 'a'.repeat(99) + '😀😀' });
    expect(Array.from(p.q)).toHaveLength(100);
    expect(() => dashboardHref(p)).not.toThrow();
    const lone = parse({ q: 'abc\uD800' });
    expect(() => dashboardHref(lone)).not.toThrow();
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

describe('hostile q', () => {
  it('keeps markup as text and encodes it in links', () => {
    const q = '<script>alert(1)</script>';
    expect(parse({ q }).q).toBe(q);
    expect(dashboardHref(parse({ q }))).toBe(`?tab=deals&q=${encodeURIComponent(q)}`);
  });
  it('strips control characters', () => {
    expect(parse({ q: 'a\u0000b' }).q).toBe('ab');
    const p = parse({ q: '\u0000' });
    expect(p.q).toBe('');
    expect(hasActiveFilters(p)).toBe(false);
  });
  it('keeps punctuation-only q', () => {
    expect(parse({ q: '!!!' }).q).toBe('!!!');
    expect(matchesQuery('Mew ex', '!!!')).toBe(true);
  });
  it('ignores Deals-only params off the Deals tab', () => {
    expect(hasActiveFilters(parse({ tab: 'singles', min: '40', kind: 'single', max: '50' }))).toBe(false);
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

describe('set, edition, condition, rarity and sort params', () => {
  it('reads repeated rarity params and encodes each one separately', () => {
    const p = parse({ rarity: ['Illustration Rare', 'Rare & Holo'] });
    expect(p.rarities).toEqual(['Illustration Rare', 'Rare & Holo']);
    expect(dashboardHref(p)).toBe('?tab=deals&rarity=Illustration%20Rare&rarity=Rare%20%26%20Holo');
  });
  it('trims, dedupes, drops empties and caps rarity at 60 code points and 20 values', () => {
    expect(parse({ rarity: [' Rare ', 'Rare', '', '   '] }).rarities).toEqual(['Rare']);
    expect(parse({ rarity: 'Rare' }).rarities).toEqual(['Rare']);
    const many = Array.from({ length: 30 }, (_, i) => `R${i}`);
    expect(parse({ rarity: many }).rarities).toEqual(many.slice(0, 20));
    expect(Array.from(parse({ rarity: '😀'.repeat(100) }).rarities[0])).toHaveLength(60);
  });
  it('knows a set key or gives null', () => {
    expect(parse({ set: 'base-set' }).set).toBe('base-set');
    expect(parse({ set: 'nope' }).set).toBeNull();
    expect(parse({ set: ['base-set', 'jungle'] }).set).toBeNull();
  });
  it('keeps a known edition, condition and sort and drops unknown ones', () => {
    expect(parse({ edition: 'first_edition' }).edition).toBe('first_edition');
    expect(parse({ edition: 'second' }).edition).toBeNull();
    expect(parse({ condition: 'sp' }).condition).toBe('sp');
    expect(parse({ condition: 'poor' }).condition).toBeNull();
    expect(parse({ sort: 'cheapest' }).sort).toBe('cheapest');
    expect(parse({ sort: 'foo' }).sort).toBeNull();
  });
  it('keeps set, rarity and sort across tabs', () => {
    const p = parse({ set: 'base-set', rarity: 'Rare', sort: 'expensive', condition: 'sp', edition: 'shadowless' });
    expect(dashboardHref(p, { tab: 'singles' })).toBe('?tab=singles&set=base-set&edition=shadowless&condition=sp&rarity=Rare&sort=expensive');
  });
  it('drops edition and condition when the target set is modern', () => {
    const p = parse({ set: 'base-set', edition: 'first_edition', condition: 'sp' });
    expect(dashboardHref(p, { set: '30th-celebration' })).toBe('?tab=deals&set=30th-celebration');
    expect(dashboardHref(p, { set: null, tab: 'singles' })).toBe('?tab=singles');
    expect(dashboardHref(p, { set: null })).toBe('?tab=deals&edition=first_edition&condition=sp');
  });
  it('counts rarity and condition as filters but not set, edition or sort', () => {
    expect(hasActiveFilters(parse({ rarity: 'Rare' }))).toBe(true);
    expect(hasActiveFilters(parse({ set: 'base-set', condition: 'sp' }))).toBe(true);
    expect(hasActiveFilters(parse({ set: 'base-set', edition: 'shadowless', sort: 'cheapest' }))).toBe(false);
  });
  it('clears filters but keeps set, edition and sort', () => {
    const p = parse({ set: 'base-set', edition: 'shadowless', sort: 'cheapest', rarity: 'Rare', condition: 'sp', q: 'x' });
    expect(clearFiltersHref(p)).toBe('?tab=deals&set=base-set&edition=shadowless&sort=cheapest');
  });
});
