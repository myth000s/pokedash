import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('.env.example', () => {
  it('is committed without a CardTrader token', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.startsWith('CARDTRADER_TOKEN='));
    expect(line).toBeDefined();
    expect(line!.slice('CARDTRADER_TOKEN='.length).trim()).toBe('');
  });
  it('lists an empty PokemonPriceTracker key', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/);
    expect(lines).toContain('POKEMONPRICETRACKER_API_KEY=');
  });
});
