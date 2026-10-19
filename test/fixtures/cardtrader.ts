import type { CtBlueprint, CtProduct } from '@/providers/cardtrader/schema';

export function ctBlueprint(over: Partial<CtBlueprint> = {}): CtBlueprint {
  return { id: 1001, name: 'Mew', expansion_id: 501, card_market_ids: [909509], ...over };
}

export function ctProduct(over: Partial<CtProduct> = {}): CtProduct {
  return {
    id: 777,
    blueprint_id: 1001,
    name_en: 'Mew',
    quantity: 1,
    price: { cents: 200000, currency: 'EUR' },
    properties_hash: { condition: 'Near Mint', pokemon_language: 'en', pokemon_reverse: false },
    user: { username: 'seller1', country_code: 'DE' },
    graded: false,
    on_vacation: false,
    bundle_size: 1,
    ...over,
  };
}
