import { z } from 'zod';
import { fetchJson } from '@/lib/http';
import {
  ctBlueprintSchema,
  ctExpansionSchema,
  ctProductSchema,
  type CtBlueprint,
  type CtExpansion,
  type CtProduct,
} from './schema';

const BASE_URL = 'https://api.cardtrader.com/api/v2';
const MARKETPLACE_DELAY_MS = 120; // keeps us under 10 requests per second

export interface CardTraderClient {
  expansions(): Promise<CtExpansion[]>;
  blueprints(expansionId: number): Promise<CtBlueprint[]>;
  marketplaceProducts(expansionId: number): Promise<Record<string, CtProduct[]>>;
}

export function createCardTraderClient(opts: {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): CardTraderClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const get = <T>(path: string, schema: z.ZodType<T>) =>
    fetchJson(`${BASE_URL}${path}`, {
      schema,
      headers: { Authorization: `Bearer ${opts.token}` },
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
    });

  return {
    expansions: () => get('/expansions', z.array(ctExpansionSchema)),
    blueprints: (expansionId) =>
      get(`/blueprints/export?expansion_id=${expansionId}`, z.array(ctBlueprintSchema)),
    marketplaceProducts: async (expansionId) => {
      await sleep(MARKETPLACE_DELAY_MS);
      return get(
        `/marketplace/products?expansion_id=${expansionId}`,
        z.record(z.string(), z.array(ctProductSchema)),
      );
    },
  };
}
