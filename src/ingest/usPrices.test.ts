import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { HttpError } from '@/lib/http';
import { ingestUsReferencePrices } from './usPrices';
import { ingestCardmarket } from './cardmarket';
import { products, usReferencePrices } from '@/db/schema';
import { THIRTIETH_CELEBRATION as SET } from '@/config/sets';
import type { Db } from '@/db/client';
import { createTestDb } from '../../test/helpers/db';
import { cardmarketFetch } from '../../test/helpers/cardmarket';

const NOW = new Date('2026-10-19T12:00:00Z');
const quote = (usdCents: number | null, dailyRemaining: number | null = 90) => ({ usdCents, dailyRemaining });
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await ingestCardmarket(db, { fetchJson: cardmarketFetch() }, SET);
  for (const [cardmarketId, tcgplayerId] of [[895551, 704143], [909509, 716192], [907607, 716000]] as const) {
    await db.update(products).set({ tcgplayerId }).where(eq(products.cardmarketId, cardmarketId));
  }
});

describe('ingestUsReferencePrices', () => {
  it('fetches sealed products and singles worth €5+, once per day', async () => {
    const client = { cardQuote: vi.fn(async () => quote(270000)), sealedQuote: vi.fn(async () => quote(12886)) };
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toEqual({ fetched: 2, alreadyToday: 0, noPrice: 0, failed: 0, stoppedEarly: false });
    expect(client.cardQuote).toHaveBeenCalledTimes(1); // Mew only; Exeggcute is under €5
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 0, alreadyToday: 2 });
  });
  it('stops when daily credits run low', async () => {
    const client = { cardQuote: vi.fn(async () => quote(270000, 9)), sealedQuote: vi.fn(async () => quote(12886, 9)) };
    const r = await ingestUsReferencePrices(db, client, SET.key, NOW);
    expect(r).toMatchObject({ fetched: 1, stoppedEarly: true });
    expect(await db.select().from(usReferencePrices)).toHaveLength(1);
    expect(client.cardQuote.mock.calls.length + client.sealedQuote.mock.calls.length).toBe(1);
  });
  it('counts products without a US price', async () => {
    const client = { cardQuote: vi.fn(async () => quote(null)), sealedQuote: vi.fn(async () => quote(null)) };
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 0, noPrice: 2 });
  });
  it('does not ask again today for a product without a price', async () => {
    const client = { cardQuote: vi.fn(async () => quote(null)), sealedQuote: vi.fn(async () => quote(null)) };
    await ingestUsReferencePrices(db, client, SET.key, NOW);
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 0, alreadyToday: 2, noPrice: 0 });
    expect(client.cardQuote.mock.calls.length + client.sealedQuote.mock.calls.length).toBe(2);
  });
  it("skips a product PPT doesn't know and continues", async () => {
    const client = { cardQuote: vi.fn(async () => quote(270000)), sealedQuote: vi.fn(async () => { throw new HttpError(404, 'https://x'); }) };
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 1, failed: 1, stoppedEarly: false });
  });
  it('stops on a server error but keeps what it fetched', async () => {
    const client = { cardQuote: vi.fn(async () => quote(270000)), sealedQuote: vi.fn(async () => { throw new HttpError(503, 'https://x'); }) };
    expect(await ingestUsReferencePrices(db, client, SET.key, NOW)).toMatchObject({ fetched: 1, stoppedEarly: true });
    expect(await db.select().from(usReferencePrices)).toHaveLength(1);
  });
});
