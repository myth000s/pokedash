import { describe, it, expect, vi } from 'vitest';
import { createCardTraderProvider } from './provider';
import { createCardTraderClient, type CardTraderClient } from './client';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import { ctBlueprint, ctProduct } from '../../../test/fixtures/cardtrader';
import type { CtProduct } from './schema';

const fakeClient = (): CardTraderClient => ({
  expansions: vi.fn(async () => [
    { id: 501, game_id: 5, code: 'a', name: '30th Celebration' },
    { id: 502, game_id: 5, code: 'b', name: '30th Celebration: Classic Collection' },
    { id: 900, game_id: 5, code: 'c', name: 'Surging Sparks' },
  ]),
  blueprints: vi.fn(async (id: number) => (id === 501 ? [ctBlueprint()] : [ctBlueprint({ id: 2002, card_market_ids: [909510] })])),
  marketplaceProducts: vi.fn(async (id: number, language: 'en' | 'de'): Promise<Record<string, CtProduct[]>> => {
    if (id !== 501) return language === 'en' ? { '2002': [ctProduct({ id: 779, blueprint_id: 2002 })] } : {};
    return language === 'en'
      ? { '1001': [ctProduct(), ctProduct({ id: 778, graded: true })] }
      : { '1001': [ctProduct({ id: 780, properties_hash: { pokemon_language: 'de' } })] };
  }),
});

describe('CardTrader provider', () => {
  it('collects listings from every matching expansion only', async () => {
    const client = fakeClient();
    const r = await createCardTraderProvider(client).fetchListings(SET, new Set([909509, 909510]));
    expect(client.blueprints).toHaveBeenCalledTimes(2);
    expect(client.marketplaceProducts).toHaveBeenCalledWith(501, 'en');
    expect(client.marketplaceProducts).toHaveBeenCalledWith(501, 'de');
    expect(client.marketplaceProducts).not.toHaveBeenCalledWith(900, expect.anything());
    expect(r.listings.map((l) => [l.externalId, l.cardmarketProductId, l.language])).toEqual([
      ['777', 909509, 'en'], ['780', 909509, 'de'], ['779', 909510, 'en'],
    ]);
    expect(r.products.map((p) => p.cardmarketProductId)).toEqual([909509, 909510]);
    expect(r.skipped).toEqual([{ externalId: '778', reason: 'Graded card' }]);
  });
  it('skips an offer whose language is not the one requested', async () => {
    const client = fakeClient();
    client.marketplaceProducts = vi.fn(async (id: number, language: 'en' | 'de'): Promise<Record<string, CtProduct[]>> =>
      id === 501 && language === 'en' ? { '1001': [ctProduct({ id: 801, properties_hash: { condition: 'Near Mint', pokemon_language: 'it' } })] } : {});
    const r = await createCardTraderProvider(client).fetchListings(SET, new Set([909509]));
    expect(r.listings).toEqual([]);
    expect(r.skipped).toEqual([{ externalId: '801', reason: 'Unexpected language' }]);
  });
  it('fails when no expansion matches the set', async () => {
    const client = { ...fakeClient(), expansions: vi.fn(async () => []) };
    await expect(createCardTraderProvider(client).fetchListings(SET, new Set()))
      .rejects.toThrow('No CardTrader expansion matches "30th Celebration"');
  });
  it('calls the marketplace endpoint with the bearer token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({}), { status: 200 }));
    await createCardTraderClient({ token: 't0k', fetchImpl, sleep: async () => {} }).marketplaceProducts(501, 'en');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cardtrader.com/api/v2/marketplace/products?expansion_id=501&language=en');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer t0k');
  });
});
