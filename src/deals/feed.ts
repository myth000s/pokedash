import { and, desc, eq, inArray, max } from 'drizzle-orm';
import { benchmarkSnapshots, listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, dealConditionsFor, type DealSettings } from '@/config/settings';
import { findSet } from '@/config/sets';
import { referenceValues, type PoolListing } from '@/deals/reference';
import { markStaleListing, scoreListing } from '@/scoring/score';
import type {
  BenchmarkAssessment, BenchmarkSnapshot, Condition, Edition, Marketplace, ProductKind, ScoredListing,
} from '@/domain/types';

export interface DealView {
  listingId: number; productName: string; kind: ProductKind; marketplace: Marketplace; url: string;
  condition: Condition | null; language: string | null; isReverseHolo: boolean; sellerCountry: string | null; imageUrl: string | null;
  priceCents: number; shippingCents: number | null; currency: string; lastSeenAt: Date;
  benchmark: BenchmarkAssessment; score: ScoredListing;
  edition: Edition; rarity: string | null; setKey: string;
  /** Cardmarket's all-language trend (trendHolo for reverse holo); shown only as a note. */
  cardmarketValueCents: number | null; cardmarketProductId: number;
}

type SnapshotRow = typeof benchmarkSnapshots.$inferSelect;

export function toSnapshot(row: SnapshotRow): BenchmarkSnapshot {
  return {
    capturedAt: row.capturedAt,
    avg: row.avgCents, low: row.lowCents, trend: row.trendCents,
    avg1: row.avg1Cents, avg7: row.avg7Cents, avg30: row.avg30Cents,
    avgHolo: row.avgHoloCents, lowHolo: row.lowHoloCents, trendHolo: row.trendHoloCents,
    avg1Holo: row.avg1HoloCents, avg7Holo: row.avg7HoloCents, avg30Holo: row.avg30HoloCents,
  };
}

export function emptySnapshot(capturedAt: Date): BenchmarkSnapshot {
  return {
    capturedAt,
    avg: null, low: null, trend: null, avg1: null, avg7: null, avg30: null,
    avgHolo: null, lowHolo: null, trendHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null,
  };
}

export function byDescNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

export async function getDealFeed(
  db: Db,
  opts: { now: Date; settings?: DealSettings; includeNonDeals?: boolean },
): Promise<DealView[]> {
  const settings = opts.settings ?? DEFAULT_DEAL_SETTINGS;

  const rows = await db
    .select({ listing: listings, product: products })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(and(eq(listings.available, true), inArray(listings.language, ['en', 'de'])));
  if (rows.length === 0) return [];

  // Latest snapshot per product = greatest capturedAt, not the most recently inserted row.
  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const snapshotRows = await db
    .selectDistinctOn([benchmarkSnapshots.productId])
    .from(benchmarkSnapshots)
    .where(inArray(benchmarkSnapshots.productId, productIds))
    .orderBy(benchmarkSnapshots.productId, desc(benchmarkSnapshots.capturedAt));
  const latest = new Map(snapshotRows.map((s) => [s.productId, s]));

  // Sealed products have no condition; they compare as one Near Mint-like group.
  const poolCondition = (kind: string, c: Condition | null): Condition | null => (kind === 'sealed' && c === null ? 'near_mint' : c);
  const pool: PoolListing[] = rows.map(({ listing: l, product: p }) => ({
    id: l.id, productId: l.productId, edition: l.edition as Edition, condition: poolCondition(p.kind, l.condition as Condition | null),
    isReverseHolo: l.isReverseHolo, priceCents: l.priceCents, language: l.language, currency: l.currency,
    available: l.available, lastSeenAt: l.lastSeenAt,
  }));
  const references = referenceValues(pool, opts.now, settings.maxListingAgeHours);

  const views: DealView[] = rows.map(({ listing: l, product: p }) => {
    const snap = latest.get(p.id);
    const kind = p.kind as ProductKind;
    const value = references.get(l.id) ?? null;
    const benchmark: BenchmarkAssessment = {
      valueCents: value, basis: 'en_de_offers',
      confidence: value === null ? 'insufficient' : 'high',
      reasons: value === null ? ['Too few EN/DE offers to compare'] : [],
      capturedAt: opts.now,
    };
    const condition = l.condition as Condition | null;
    const set = findSet(p.setKey);
    const dealSettings = set ? { ...settings, dealConditions: dealConditionsFor(set) } : settings;
    const score = markStaleListing(
      scoreListing(
        { priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, condition, language: l.language, kind },
        benchmark,
        dealSettings,
      ),
      l.lastSeenAt, opts.now, settings.maxListingAgeHours,
    );
    return {
      listingId: l.id, productName: p.name, kind, marketplace: l.marketplace as Marketplace, url: l.url,
      condition, language: l.language, isReverseHolo: l.isReverseHolo, sellerCountry: l.sellerCountry, imageUrl: l.imageUrl,
      priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, lastSeenAt: l.lastSeenAt,
      benchmark, score,
      edition: l.edition as Edition, rarity: l.rarity, setKey: p.setKey,
      cardmarketValueCents: snap ? (l.isReverseHolo ? snap.trendHoloCents : snap.trendCents) : null,
      cardmarketProductId: p.cardmarketId,
    };
  });

  return views
    .filter((v) => opts.includeNonDeals || v.score.isDeal)
    .sort((a, b) =>
      byDescNullsLast(a.score.discountCents, b.score.discountCents)
      || byDescNullsLast(a.score.discountPct, b.score.discountPct)
      || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export async function getLastCheckedAt(db: Db): Promise<Date | null> {
  const [row] = await db.select({ at: max(listings.lastSeenAt) }).from(listings);
  return row?.at ?? null;
}
