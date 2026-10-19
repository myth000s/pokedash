import type { Marketplace, NormalizedListing } from '@/domain/types';
import type { ListingProvider } from '@/providers/types';

export function fakeProvider(marketplace: Marketplace, result: NormalizedListing[] | Error): ListingProvider {
  return {
    marketplace,
    async fetchListings() {
      if (result instanceof Error) throw result;
      return { listings: result, skipped: [], products: [] };
    },
  };
}
