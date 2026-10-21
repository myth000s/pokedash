import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch } from './search';

describe('normalizeForSearch', () => {
  it('lower-cases, strips diacritics and turns punctuation into spaces', () => {
    expect(normalizeForSearch('Évoli-ex')).toBe('evoli ex');
  });
});

describe('matchesQuery', () => {
  it('requires every word to appear in the name', () => {
    expect(matchesQuery('Pokémon Center Elite Trainer Box', 'pokemon etb')).toBe(false);
    expect(matchesQuery('Pokémon Center Elite Trainer Box', 'pokemon elite')).toBe(true);
    expect(matchesQuery('Pikachu (25th Anniversary)', 'pika 25')).toBe(true);
  });
  it('matches everything for an empty or punctuation-only query', () => {
    expect(matchesQuery('X', '')).toBe(true);
    expect(matchesQuery('X', '!!!')).toBe(true);
  });
});
