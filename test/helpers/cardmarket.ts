import { CARDMARKET_URLS } from '@/providers/cardmarket/parse';
import { loadJson } from './fixtures';

type Key = 'priceGuide' | 'singles' | 'nonSingles';

const FIXTURES: Record<Key, string> = {
  priceGuide: 'cardmarket/price_guide_6.json',
  singles: 'cardmarket/products_singles_6.json',
  nonSingles: 'cardmarket/products_nonsingles_6.json',
};

/** Serves the Cardmarket fixtures by URL; any other URL throws. */
export function cardmarketFetch(overrides: Partial<Record<Key, unknown>> = {}) {
  return async (url: string): Promise<unknown> => {
    const key = (Object.keys(CARDMARKET_URLS) as Key[]).find((k) => CARDMARKET_URLS[k] === url);
    if (!key) throw new Error(`Unexpected URL in test: ${url}`);
    return key in overrides ? overrides[key] : loadJson(FIXTURES[key]);
  };
}
