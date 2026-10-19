import type { Condition } from '@/domain/types';

export interface DealSettings {
  minDiscountPct: number;
  minBenchmarkCents: number;
  maxBenchmarkAgeHours: number;
  suspiciousDiscountPct: number;
  languages: string[];
  dealConditions: Condition[];
}

export const DEFAULT_DEAL_SETTINGS: DealSettings = {
  minDiscountPct: 0.2,
  minBenchmarkCents: 500,
  maxBenchmarkAgeHours: 48,
  suspiciousDiscountPct: 0.6,
  languages: ['en', 'de'],
  dealConditions: ['mint', 'near_mint'],
};
