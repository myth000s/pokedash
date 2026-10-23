import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { missingIngestSecrets, parseIngestMode, runIngestion } from './run';
import { THIRTIETH_CELEBRATION as SET, JUNGLE } from '@/config/sets';
import { cardmarketFetch } from '../../test/helpers/cardmarket';
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

describe('runIngestion with several sets', () => {
  it('downloads each Cardmarket URL once and skips US prices for sets without them', async () => {
    const db = await createTestDb();
    const inner = cardmarketFetch();
    const fetchJson = vi.fn(inner);
    const ppt = { fetchSetPrices: vi.fn(), fetchCardPrice: vi.fn() } as unknown as PptClient;
    const noUs = { ...JUNGLE, usPrices: false };
    await runIngestion(db, { fetchJson, ppt, providers: [] }, [noUs, { ...noUs, key: 'fossil' }], new Date('2026-10-20T12:00:00Z'), 'daily');
    expect(fetchJson).toHaveBeenCalledTimes(3);
    expect(Object.values(ppt).every((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true);
  });
});

describe('runIngestion once-per-run downloads', () => {
  const ECB = readFileSync('test/fixtures/ecb-daily.xml', 'utf8');
  it('fetches the exchange rate once per run, reported with the first set', async () => {
    const db = await createTestDb();
    const fetchText = vi.fn(async () => ECB);
    const noUs = { ...JUNGLE, usPrices: false };
    const reports = await runIngestion(db, { fetchJson: cardmarketFetch(), fetchText, providers: [] }, [noUs, { ...noUs, key: 'fossil' }, { ...noUs, key: 'team-rocket' }], new Date('2026-10-20T12:00:00Z'), 'daily');
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(reports.map((r) => r.fx)).toEqual([{ rateDate: '2026-10-19', inserted: true }, undefined, undefined]);
  });
  it('retries a failed Cardmarket download for the next set instead of reusing the failure', async () => {
    const db = await createTestDb();
    const inner = cardmarketFetch();
    let failures = 1;
    const fetchJson = vi.fn(async (url: string) => {
      if (failures > 0) { failures -= 1; throw new Error('timeout'); }
      return inner(url);
    });
    const noUs = { ...JUNGLE, usPrices: false };
    const reports = await runIngestion(db, { fetchJson, providers: [] }, [noUs, { ...noUs, key: 'fossil' }], new Date('2026-10-20T12:00:00Z'), 'daily');
    expect(reports[0].cardmarket).toEqual({ error: 'timeout' });
    expect(reports[1].cardmarket).not.toHaveProperty('error');
    // 3 URLs: the failed one was fetched again, the other two were reused.
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });
});
