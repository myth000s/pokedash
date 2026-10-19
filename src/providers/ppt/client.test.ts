import { describe, it, expect, vi } from 'vitest';
import { createPptClient } from './client';

describe('createPptClient', () => {
  it('reads a card market price in cents with the remaining credits', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { tcgPlayerId: '716192', prices: { market: 10.3 } } }), { status: 200, headers: { 'X-RateLimit-Daily-Remaining': '93' } }));
    const c = createPptClient({ apiKey: 'k3y', fetchImpl, sleep: async () => {} });
    await expect(c.cardQuote(716192)).resolves.toEqual({ usdCents: 1030, dailyRemaining: 93 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=716192&limit=1');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer k3y');
  });
  it('reads a sealed unopened price from a list response', async () => {
    const body = { data: [{ tcgPlayerId: '709036', unopenedPrice: 1460.07 }, { tcgPlayerId: '704143', unopenedPrice: 128.86 }] };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: 200 }));
    await expect(createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).sealedQuote(704143)).resolves.toEqual({ usdCents: 12886, dailyRemaining: null });
  });
  it('reads a sealed unopened price from a single object', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { tcgPlayerId: '704143', unopenedPrice: 128.86 } }), { status: 200 }));
    await expect(createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).sealedQuote(704143)).resolves.toMatchObject({ usdCents: 12886 });
  });
  it('returns no price for a zero price or a different product', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ tcgPlayerId: '1', unopenedPrice: 0 }] }), { status: 200 }));
    const c = createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} });
    await expect(c.sealedQuote(1)).resolves.toMatchObject({ usdCents: null });
    await expect(c.sealedQuote(2)).resolves.toMatchObject({ usdCents: null });
  });
  it('asks for one result so a sealed lookup costs one credit', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).sealedQuote(704143);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://www.pokemonpricetracker.com/api/v2/sealed-products?tcgPlayerId=704143&limit=1');
  });
  it("returns no price when the card entry is another card's", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ tcgPlayerId: '999', prices: { market: 5 } }] }), { status: 200 }));
    await expect(createPptClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).cardQuote(716192)).resolves.toMatchObject({ usdCents: null });
  });
  it('waits between calls', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { prices: { market: 1 } } }), { status: 200 }));
    const c = createPptClient({ apiKey: 'k', fetchImpl, sleep });
    await c.cardQuote(1);
    expect(sleep).not.toHaveBeenCalled();
    await c.cardQuote(2);
    expect(sleep).toHaveBeenCalledWith(1100);
  });
});
