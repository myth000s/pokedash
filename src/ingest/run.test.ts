import { describe, it, expect, vi } from 'vitest';
import { missingIngestSecrets, parseIngestMode, runIngestion } from './run';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { createTestDb } from '../../test/helpers/db';
import { fakeProvider } from '../../test/helpers/fake-provider';
import type { PptClient } from '@/providers/ppt/client';

describe('parseIngestMode', () => {
  it('parses ingest modes', () => {
    expect(parseIngestMode([])).toBe('all');
    expect(parseIngestMode(['--listings'])).toBe('listings');
    expect(parseIngestMode(['--daily'])).toBe('daily');
    expect(() => parseIngestMode(['--nope'])).toThrow('Unknown option: --nope. Use --listings or --daily.');
  });
});

describe('missingIngestSecrets', () => {
  it('requires the CardTrader token for the scheduled listings run', () => {
    expect(missingIngestSecrets('listings', {})).toEqual(['CARDTRADER_TOKEN']);
    // GitHub passes an unset secret as an empty string.
    expect(missingIngestSecrets('listings', { CARDTRADER_TOKEN: '' })).toEqual(['CARDTRADER_TOKEN']);
    expect(missingIngestSecrets('listings', { CARDTRADER_TOKEN: '  ' })).toEqual(['CARDTRADER_TOKEN']);
    expect(missingIngestSecrets('listings', { CARDTRADER_TOKEN: 'token' })).toEqual([]);
  });
  it('requires both keys for the scheduled daily run', () => {
    expect(missingIngestSecrets('daily', {})).toEqual(['CARDTRADER_TOKEN', 'POKEMONPRICETRACKER_API_KEY']);
    expect(missingIngestSecrets('daily', { CARDTRADER_TOKEN: 'token', POKEMONPRICETRACKER_API_KEY: '' })).toEqual(['POKEMONPRICETRACKER_API_KEY']);
    expect(missingIngestSecrets('daily', { CARDTRADER_TOKEN: 'token', POKEMONPRICETRACKER_API_KEY: 'key' })).toEqual([]);
  });
  it('requires nothing for a local run, which skips what is missing', () => {
    expect(missingIngestSecrets('all', {})).toEqual([]);
  });
  it('returns names only, never values', () => {
    const env = { CARDTRADER_TOKEN: 'secret-token-value', POKEMONPRICETRACKER_API_KEY: '' };
    expect(JSON.stringify(missingIngestSecrets('daily', env))).not.toContain('secret-token-value');
  });
});

describe('runIngestion modes', () => {
  it('runs only the listing providers in listings mode', async () => {
    const db = await createTestDb();
    const fetchJson = vi.fn();
    const fetchText = vi.fn();
    const ppt = { fetchSetPrices: vi.fn(), fetchCardPrice: vi.fn() } as unknown as PptClient;
    const [report] = await runIngestion(
      db,
      { fetchJson, fetchText, ppt, providers: [fakeProvider('cardtrader', [])] },
      [SET],
      new Date('2026-10-20T12:00:00Z'),
      'listings',
    );
    expect(report.providers).toHaveLength(1);
    expect(report.cardmarket).toBeUndefined();
    expect(report.fx).toBeUndefined();
    expect(report.usPrices).toBeUndefined();
    expect(fetchJson).not.toHaveBeenCalled();
    expect(fetchText).not.toHaveBeenCalled();
    expect(Object.values(ppt).every((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true);
  });
});
