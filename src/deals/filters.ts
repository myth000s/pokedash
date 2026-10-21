import { matchesQuery } from '@/lib/search';
import type { ProductKind } from '@/domain/types';
import type { DealView } from '@/deals/feed';

export interface DealFilters {
  q: string;
  lang: 'en' | 'de' | null;
  kind: ProductKind | null;
  minPct: number | null;
  maxPriceCents: number | null;
}

/** Pure; keeps input order and never mutates the input. */
export function filterDeals(deals: DealView[], f: DealFilters): DealView[] {
  return deals.filter((d) =>
    (f.lang === null || d.language === f.lang)
    && (f.kind === null || d.kind === f.kind)
    && (f.minPct === null || (d.score.discountPct !== null && d.score.discountPct >= f.minPct / 100))
    && (f.maxPriceCents === null || d.priceCents <= f.maxPriceCents)
    && matchesQuery(d.productName, f.q));
}
