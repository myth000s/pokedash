import { z } from 'zod';
import type { PriceGuideCents, ProductKind } from '@/domain/types';
import type { TrackedSet } from '@/config/sets';

export const CARDMARKET_URLS = {
  priceGuide: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
  singles: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json',
  nonSingles: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json',
};

export interface CatalogProduct {
  cardmarketId: number;
  name: string;
  categoryName: string;
  expansionId: number;
  kind: ProductKind;
}

/** Euros to integer cents. Missing, null and non-positive values mean "no data". */
export function eurosToCents(v: number | null | undefined): number | null {
  if (v == null || v <= 0) return null;
  return Math.round(v * 100);
}

// Cardmarket writes offsets as "+0200"; Date needs "+02:00".
function parseCreatedAt(s: string): Date {
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid createdAt: ${s}`);
  return d;
}

const price = z.number().nullable().optional();

const catalogSchema = z.object({
  version: z.number(),
  createdAt: z.string(),
  products: z.array(
    z.object({
      idProduct: z.number(),
      name: z.string(),
      categoryName: z.string(),
      idExpansion: z.number(),
    }),
  ),
});

const priceGuideSchema = z.object({
  version: z.number(),
  createdAt: z.string(),
  priceGuides: z.array(
    z.object({
      idProduct: z.number(),
      avg: price, low: price, trend: price, avg1: price, avg7: price, avg30: price,
      'avg-holo': price, 'low-holo': price, 'trend-holo': price,
      'avg1-holo': price, 'avg7-holo': price, 'avg30-holo': price,
    }),
  ),
});

export function parseCatalog(json: unknown, kind: ProductKind, set: TrackedSet): CatalogProduct[] {
  const file = catalogSchema.parse(json);
  parseCreatedAt(file.createdAt);
  return file.products
    .filter((p) => set.cardmarketExpansionIds.includes(p.idExpansion) && !set.excludedCategories.includes(p.categoryName))
    .map((p) => ({ cardmarketId: p.idProduct, name: p.name, categoryName: p.categoryName, expansionId: p.idExpansion, kind }));
}

export function parsePriceGuide(json: unknown): { capturedAt: Date; byProductId: Map<number, PriceGuideCents> } {
  const file = priceGuideSchema.parse(json);
  const byProductId = new Map<number, PriceGuideCents>();
  for (const r of file.priceGuides) {
    byProductId.set(r.idProduct, {
      avg: eurosToCents(r.avg), low: eurosToCents(r.low), trend: eurosToCents(r.trend),
      avg1: eurosToCents(r.avg1), avg7: eurosToCents(r.avg7), avg30: eurosToCents(r.avg30),
      avgHolo: eurosToCents(r['avg-holo']), lowHolo: eurosToCents(r['low-holo']), trendHolo: eurosToCents(r['trend-holo']),
      avg1Holo: eurosToCents(r['avg1-holo']), avg7Holo: eurosToCents(r['avg7-holo']), avg30Holo: eurosToCents(r['avg30-holo']),
    });
  }
  return { capturedAt: parseCreatedAt(file.createdAt), byProductId };
}
