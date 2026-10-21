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
  it.each([
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'IMPRINT_NAME',
    'IMPRINT_STREET',
    'IMPRINT_POSTAL_CITY',
    'IMPRINT_EMAIL',
  ])('lists %s with an empty value', (name) => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/);
    expect(lines).toContain(`${name}=`);
  });
  it('points SUPABASE_URL at the local stack', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/);
    expect(lines).toContain('SUPABASE_URL=http://127.0.0.1:54321');
  });
});
