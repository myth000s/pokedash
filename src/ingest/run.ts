import { describeError } from '../lib/errors';
import type { Db } from '@/db/client';
import type { TrackedSet } from '@/config/sets';
import type { Marketplace } from '@/domain/types';
import type { ListingProvider } from '@/providers/types';
import { ingestCardmarket } from './cardmarket';
import type { PptClient } from '@/providers/ppt/client';
import { ingestFxRate } from './fx';
import { ingestListings } from './listings';
import { ingestUsReferencePrices } from './usPrices';

export interface IngestionReport {
  set: string;
  cardmarket?: { products: number; snapshots: number } | { error: string };
  providers: { marketplace: Marketplace; result?: Awaited<ReturnType<typeof ingestListings>>; error?: string }[];
  fx?: { rateDate: string; inserted: boolean } | { error: string };
  usPrices?: Awaited<ReturnType<typeof ingestUsReferencePrices>> | { error: string };
}

export type IngestMode = 'all' | 'listings' | 'daily';

export function parseIngestMode(argv: string[]): IngestMode {
  if (argv.length === 0) return 'all';
  const [arg] = argv;
  if (argv.length === 1 && arg === '--listings') return 'listings';
  if (argv.length === 1 && arg === '--daily') return 'daily';
  throw new Error(`Unknown option: ${arg}. Use --listings or --daily.`);
}

const SCHEDULED_SECRETS: Record<IngestMode, string[]> = {
  all: [],
  listings: ['CARDTRADER_TOKEN'],
  daily: ['CARDTRADER_TOKEN', 'POKEMONPRICETRACKER_API_KEY'],
};

/**
 * Names (never values) of the secrets a scheduled run lacks. The --listings and --daily runs
 * fail on a missing one, so a lost GitHub secret turns the workflow red instead of quietly
 * skipping a source. A local run (no flag) skips whatever is missing.
 */
export function missingIngestSecrets(mode: IngestMode, env: Readonly<Record<string, string | undefined>>): string[] {
  return SCHEDULED_SECRETS[mode].filter((name) => !env[name]?.trim());
}

const messageOf = describeError;

export async function runIngestion(
  db: Db,
  deps: {
    fetchJson: (url: string) => Promise<unknown>;
    providers: ListingProvider[];
    fetchText?: (url: string) => Promise<string>;
    ppt?: PptClient;
  },
  sets: TrackedSet[],
  now: Date,
  mode: IngestMode = 'all',
): Promise<IngestionReport[]> {
  const reports: IngestionReport[] = [];
  // The Cardmarket catalogs and price guide are the same for every set: download each URL once.
  const cache = new Map<string, Promise<unknown>>();
  const fetchJson = (url: string) => {
    let hit = cache.get(url);
    if (!hit) {
      hit = deps.fetchJson(url);
      cache.set(url, hit);
    }
    return hit;
  };
  for (const set of sets) {
    const report: IngestionReport = { set: set.key, providers: [] };
    if (mode !== 'listings') {
      try {
        const { products, snapshots } = await ingestCardmarket(db, { fetchJson }, set);
        report.cardmarket = { products, snapshots };
      } catch (err) {
        // Providers still run against the previous market values.
        report.cardmarket = { error: messageOf(err) };
      }
    }
    for (const provider of deps.providers) {
      try {
        report.providers.push({ marketplace: provider.marketplace, result: await ingestListings(db, provider, set, now) });
      } catch (err) {
        report.providers.push({ marketplace: provider.marketplace, error: messageOf(err) });
      }
    }
    if (mode !== 'listings' && deps.fetchText) {
      try {
        report.fx = await ingestFxRate(db, { fetchText: deps.fetchText });
      } catch (err) {
        report.fx = { error: messageOf(err) };
      }
    }
    if (mode !== 'listings' && deps.ppt && set.usPrices) {
      try {
        report.usPrices = await ingestUsReferencePrices(db, deps.ppt, set.key, now);
      } catch (err) {
        report.usPrices = { error: messageOf(err) };
      }
    }
    reports.push(report);
  }
  return reports;
}
