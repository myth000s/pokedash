import type { Marketplace, NormalizedListing } from '@/domain/types';
import type { TrackedSet } from '@/config/sets';

export interface ProviderResult {
  listings: NormalizedListing[];
  skipped: { externalId: string; reason: string }[];
}

export interface ListingProvider {
  readonly marketplace: Marketplace;
  fetchListings(set: TrackedSet, trackedCardmarketIds: ReadonlySet<number>): Promise<ProviderResult>;
}
