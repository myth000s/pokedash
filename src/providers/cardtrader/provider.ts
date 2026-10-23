import type { ListingProvider, ProviderResult } from '../types';
import type { CardTraderClient } from './client';
import { normalizeCtProduct } from './normalize';
import { collectProductMeta } from './meta';
import type { CtBlueprint } from './schema';

const LANGUAGES = ['en', 'de'] as const;

export function createCardTraderProvider(client: CardTraderClient): ListingProvider {
  // One expansions call serves every set for the provider's lifetime.
  let expansionsPromise: ReturnType<CardTraderClient['expansions']> | undefined;
  const expansionsOnce = () => {
    expansionsPromise ??= client.expansions();
    expansionsPromise.catch(() => { expansionsPromise = undefined; });
    return expansionsPromise;
  };
  return {
    marketplace: 'cardtrader',
    async fetchListings(set, trackedCardmarketIds) {
      const ids = set.cardtraderExpansionIds;
      const expansions = (await expansionsOnce())
        .filter((e) => (ids ? ids.includes(e.id) : e.name.startsWith(set.cardtraderExpansionPrefix)))
        .sort((a, b) => a.id - b.id);
      if (expansions.length === 0) {
        throw new Error(`No CardTrader expansion matches "${set.cardtraderExpansionPrefix}"`);
      }

      const result: ProviderResult = { listings: [], skipped: [], products: [] };
      const allBlueprints: CtBlueprint[] = [];
      for (const expansion of expansions) {
        const expansionBlueprints = await client.blueprints(expansion.id);
        allBlueprints.push(...expansionBlueprints);
        const blueprints = new Map(expansionBlueprints.map((b) => [b.id, b]));
        // Ask per language so cheap offers in other languages don't crowd out en/de ones.
        for (const language of LANGUAGES) {
          const byBlueprint = await client.marketplaceProducts(expansion.id, language);
          for (const products of Object.values(byBlueprint)) {
            for (const product of products) {
              const r = normalizeCtProduct(product, blueprints.get(product.blueprint_id), trackedCardmarketIds, {
                set, expansionId: expansion.id,
              });
              if ('listing' in r && r.listing.language !== language) {
                result.skipped.push({ externalId: String(product.id), reason: 'Unexpected language' });
              } else if ('listing' in r) result.listings.push(r.listing);
              else result.skipped.push({ externalId: String(product.id), reason: r.skip });
            }
          }
        }
      }
      result.products = collectProductMeta(allBlueprints, trackedCardmarketIds);
      return result;
    },
  };
}
