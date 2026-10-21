import type { Condition } from '@/domain/types';

export interface DealSettings {
  minDiscountPct: number;
  minBenchmarkCents: number;
  maxBenchmarkAgeHours: number;
  maxListingAgeHours: number;
  suspiciousDiscountPct: number;
  languages: string[];
  dealConditions: Condition[];
}

export const DEFAULT_DEAL_SETTINGS: DealSettings = {
  minDiscountPct: 0.2,
  minBenchmarkCents: 500,
  maxBenchmarkAgeHours: 72,
  maxListingAgeHours: 72,
  suspiciousDiscountPct: 0.6,
  languages: ['en', 'de'],
  dealConditions: ['mint', 'near_mint'],
};

/** How long rows are kept before the daily cleanup deletes them. */
export const RETENTION_DAYS = {
  unavailableListings: 30,
  listingPriceHistory: 90,
  usReferencePrices: 30,
  benchmarkSnapshots: 365,
} as const;

/** The daily run fails when the database grows past this size. */
export const DB_SIZE_ALERT_BYTES = 400 * 1024 * 1024;
