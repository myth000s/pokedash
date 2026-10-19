import type { ListingProvider, ProviderResult } from '../types';
import type { CardTraderClient } from './client';
import { normalizeCtProduct } from './normalize';

export function createCardTraderProvider(client: CardTraderClient): ListingProvider {
  return {
    marketplace: 'cardtrader',
    async fetchListings(set, trackedCardmarketIds) {
      const expansions = (await client.expansions())
        .filter((e) => e.name.startsWith(set.cardtraderExpansionPrefix))
        .sort((a, b) => a.id - b.id);
      if (expansions.length === 0) {
        throw new Error(`No CardTrader expansion matches "${set.cardtraderExpansionPrefix}"`);
      }

      const result: ProviderResult = { listings: [], skipped: [] };
      for (const expansion of expansions) {
        const blueprints = new Map((await client.blueprints(expansion.id)).map((b) => [b.id, b]));
        const byBlueprint = await client.marketplaceProducts(expansion.id);
        for (const products of Object.values(byBlueprint)) {
          for (const product of products) {
            const r = normalizeCtProduct(product, blueprints.get(product.blueprint_id), trackedCardmarketIds);
            if ('listing' in r) result.listings.push(r.listing);
            else result.skipped.push({ externalId: String(product.id), reason: r.skip });
          }
        }
      }
      return result;
    },
  };
}
