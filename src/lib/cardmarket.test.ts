import { describe, it, expect } from 'vitest';
import { cardmarketCheckUrl } from './cardmarket';

describe('cardmarketCheckUrl', () => {
  it('builds a Cardmarket Pokémon search URL filtered to EN+DE and Near Mint', () => {
    const url = new URL(cardmarketCheckUrl(123, 'Gengar ex'));
    expect(url.origin + url.pathname).toBe('https://www.cardmarket.com/en/Pokemon/Products/Search');
    expect(url.searchParams.get('searchString')).toBe('Gengar ex');
    expect(url.searchParams.get('language')).toBe('1,3');
    expect(url.searchParams.get('minCondition')).toBe('2');
  });
  it('encodes the product name safely', () => {
    const raw = cardmarketCheckUrl(1, 'Mew [Psychic | 30C] & "x"#?');
    expect(raw).not.toMatch(/[ |#"[\]]/);
    const url = new URL(raw);
    expect(url.searchParams.get('searchString')).toBe('Mew [Psychic | 30C] & "x"#?');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual(['searchString', 'language', 'minCondition']);
  });
});
