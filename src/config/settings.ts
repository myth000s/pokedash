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
