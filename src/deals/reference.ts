import type { Condition, Edition } from '@/domain/types';

export type ConditionGroup = 'nm' | 'sp' | 'mp';

export function conditionGroup(c: Condition | null): ConditionGroup | null {
  switch (c) {
    case 'mint':
    case 'near_mint':
      return 'nm';
    case 'slightly_played':
      return 'sp';
    case 'moderately_played':
      return 'mp';
    default:
      return null;
  }
}

export interface PoolListing {
  id: number; productId: number; edition: Edition; condition: Condition | null; isReverseHolo: boolean;
  priceCents: number; language: string | null; currency: string; available: boolean; lastSeenAt: Date;
}

const MS_PER_HOUR = 3_600_000;

/** True when the listing was last seen within maxAgeHours of now. */
export function isFresh(lastSeenAt: Date, now: Date, maxAgeHours: number): boolean {
  return (now.getTime() - lastSeenAt.getTime()) / MS_PER_HOUR <= maxAgeHours;
}

/** The listing conditions that make up each condition group. */
export const GROUP_CONDITIONS: Record<ConditionGroup, Condition[]> = {
  nm: ['mint', 'near_mint'], sp: ['slightly_played'], mp: ['moderately_played'],
};
const MIN_OTHERS = 3;

/**
 * For every eligible listing: the second-cheapest *other* listing of its group
 * (same product, edition, condition group, reverse-holo state), or null when
 * fewer than 3 others exist. Ineligible listings are absent from the result.
 */
export function referenceValues(pool: PoolListing[], now: Date, maxAgeHours: number): Map<number, number | null> {
  const groups = new Map<string, PoolListing[]>();
  for (const l of pool) {
    const group = conditionGroup(l.condition);
    if (!l.available || group === null || l.currency !== 'EUR') continue;
    if (l.language !== 'en' && l.language !== 'de') continue;
    if (!isFresh(l.lastSeenAt, now, maxAgeHours)) continue;
    const key = `${l.productId}|${l.edition}|${group}|${l.isReverseHolo}`;
    const members = groups.get(key);
    if (members) members.push(l); else groups.set(key, [l]);
  }

  const result = new Map<number, number | null>();
  for (const members of groups.values()) {
    const sorted = [...members].sort((a, b) => a.priceCents - b.priceCents);
    sorted.forEach((l, i) => {
      if (sorted.length - 1 < MIN_OTHERS) { result.set(l.id, null); return; }
      // Second-cheapest other: skipping a member of the two cheapest shifts it to index 2.
      result.set(l.id, (i <= 1 ? sorted[2] : sorted[1]).priceCents);
    });
  }
  return result;
}

/** Median of the 3 cheapest prices (the second-cheapest), or null under 3 prices. */
export function cheapestReference(prices: number[]): number | null {
  if (prices.length < 3) return null;
  return [...prices].sort((a, b) => a - b)[1];
}
