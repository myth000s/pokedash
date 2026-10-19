import { z } from 'zod';
import { fetchJsonWithHeaders } from '@/lib/http';

const BASE_URL = 'https://www.pokemonpricetracker.com/api/v2';
const DEFAULT_DELAY_MS = 1100; // free tier: be gentle between calls

export interface PptQuote {
  usdCents: number | null;
  dailyRemaining: number | null;
}
export interface PptClient {
  cardQuote(tcgPlayerId: number): Promise<PptQuote>;
  sealedQuote(tcgPlayerId: number): Promise<PptQuote>;
}

const cardEntry = z.object({ prices: z.object({ market: z.number().nullish() }).loose().nullish() }).loose();
const cardSchema = z.object({ data: z.union([cardEntry, z.array(cardEntry)]) }).loose();
const sealedEntry = z.object({ tcgPlayerId: z.union([z.string(), z.number()]).nullish(), unopenedPrice: z.number().nullish() }).loose();
const sealedSchema = z.object({ data: z.union([sealedEntry, z.array(sealedEntry)]) }).loose();

function toCents(usd: number | null | undefined): number | null {
  return usd == null || usd <= 0 ? null : Math.round(usd * 100);
}

export function createPptClient(opts: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  delayMs?: number;
}): PptClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  let calls = 0;
  const get = async <T>(path: string, schema: z.ZodType<T>) => {
    if (calls++ > 0) await sleep(delayMs);
    return fetchJsonWithHeaders(`${BASE_URL}${path}`, {
      schema,
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
    });
  };
  const remaining = (headers: Headers): number | null => {
    const raw = headers.get('X-RateLimit-Daily-Remaining');
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    async cardQuote(id) {
      const { data, headers } = await get(`/cards?tcgPlayerId=${id}`, cardSchema);
      const entry = Array.isArray(data.data) ? data.data[0] : data.data;
      return { usdCents: toCents(entry?.prices?.market), dailyRemaining: remaining(headers) };
    },
    async sealedQuote(id) {
      const { data, headers } = await get(`/sealed-products?tcgPlayerId=${id}`, sealedSchema);
      const entries = Array.isArray(data.data) ? data.data : [data.data];
      const entry = entries.find((e) => e.tcgPlayerId != null && String(e.tcgPlayerId) === String(id));
      return { usdCents: toCents(entry?.unopenedPrice), dailyRemaining: remaining(headers) };
    },
  };
}
