import { describeError } from '../lib/errors';
import type { Db } from '@/db/client';
import type { TrackedSet } from '@/config/sets';
import type { Marketplace } from '@/domain/types';
import type { ListingProvider } from '@/providers/types';
import { ingestCardmarket } from './cardmarket';
import { ingestListings } from './listings';

export interface IngestionReport {
  set: string;
  cardmarket: { products: number; snapshots: number } | { error: string };
  providers: { marketplace: Marketplace; result?: Awaited<ReturnType<typeof ingestListings>>; error?: string }[];
}

const messageOf = describeError;

export async function runIngestion(
  db: Db,
  deps: { fetchJson: (url: string) => Promise<unknown>; providers: ListingProvider[] },
  sets: TrackedSet[],
  now: Date,
): Promise<IngestionReport[]> {
  const reports: IngestionReport[] = [];
  for (const set of sets) {
    const report: IngestionReport = { set: set.key, cardmarket: { error: '' }, providers: [] };
    try {
      const { products, snapshots } = await ingestCardmarket(db, { fetchJson: deps.fetchJson }, set);
      report.cardmarket = { products, snapshots };
    } catch (err) {
      // Providers still run against the previous market values.
      report.cardmarket = { error: messageOf(err) };
    }
    for (const provider of deps.providers) {
      try {
        report.providers.push({ marketplace: provider.marketplace, result: await ingestListings(db, provider, set, now) });
      } catch (err) {
        report.providers.push({ marketplace: provider.marketplace, error: messageOf(err) });
      }
    }
    reports.push(report);
  }
  return reports;
}
