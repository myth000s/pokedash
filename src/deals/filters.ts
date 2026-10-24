import { matchesQuery } from '@/lib/search';
import { conditionGroup, type ConditionGroup } from '@/deals/reference';
import { NO_RARITY, type SortKey } from '@/deals/sections';
import type { Edition, ProductKind } from '@/domain/types';
import type { DealView } from '@/deals/feed';

export interface DealFilters {
  q: string;
  lang: 'en' | 'de' | null;
  kind: ProductKind | null;
  minPct: number | null;
  maxPriceCents: number | null;
  set: string | null;
  edition: Edition | null;
  condition: ConditionGroup | null;
  rarities: string[];
  sort: SortKey | null;
}

/** Pure; never mutates the input. Keeps the incoming order (biggest € saving) unless a price sort is chosen. */
export function filterDeals(deals: DealView[], f: DealFilters): DealView[] {
  const kept = deals.filter((d) =>
    (f.lang === null || d.language === f.lang)
    && (f.kind === null || d.kind === f.kind)
    && (f.minPct === null || (d.score.discountPct !== null && Math.round(d.score.discountPct * 100) >= f.minPct))
    && (f.maxPriceCents === null || d.priceCents <= f.maxPriceCents)
    && (f.set === null || d.setKey === f.set)
    && (f.edition === null || d.edition === f.edition)
    // Sealed products have no condition: they count as Near Mint.
    && (f.condition === null || (d.kind === 'sealed' ? 'nm' : conditionGroup(d.condition)) === f.condition)
    && (f.rarities.length === 0 || f.rarities.includes(d.rarity ?? NO_RARITY))
    && matchesQuery(d.productName, f.q));
  if (f.sort === 'cheapest') return kept.sort((a, b) => a.priceCents - b.priceCents);
  if (f.sort === 'expensive') return kept.sort((a, b) => b.priceCents - a.priceCents);
  return kept;
}
