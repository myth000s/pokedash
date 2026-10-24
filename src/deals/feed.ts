import { and, desc, eq, gte, inArray, lte, max, sql } from 'drizzle-orm';
import { benchmarkSnapshots, listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, dealConditionsFor, type DealSettings } from '@/config/settings';
import { findSet } from '@/config/sets';
import { MIN_GROUP_SIZE, rankedOffers } from '@/deals/rankedOffers';
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

/** The deal settings for a product's set (vintage sets accept more conditions). */
export function dealSettingsFor(settings: DealSettings, setKey: string): DealSettings {
  const set = findSet(setKey);
  return set ? { ...settings, dealConditions: dealConditionsFor(set) } : settings;
}

/** The benchmark for a reference value computed from current EN/DE offers; null means too few offers. */
export function enDeBenchmark(value: number | null, now: Date): BenchmarkAssessment {
  return {
    valueCents: value, basis: 'en_de_offers',
    confidence: value === null ? 'insufficient' : 'high',
    reasons: value === null ? ['Too few EN/DE offers to compare'] : [],
    capturedAt: now,
  };
}

/**
 * The current deals, biggest € saving first. The pool is ranked in SQL (rankedOffers): only the two
 * cheapest offers of a group of 4+ can be 20% below the second-cheapest other one, and of those only
 * the rows that pass the value and discount rules come back. `setKey` narrows it to one set.
 */
export async function getDealFeed(
  db: Db,
  opts: { now: Date; settings?: DealSettings; setKey?: string | null },
): Promise<DealView[]> {
  const settings = opts.settings ?? DEFAULT_DEAL_SETTINGS;
  const { ctes, ranked } = rankedOffers(db, {
    now: opts.now, maxAgeHours: settings.maxListingAgeHours,
    where: opts.setKey ? [eq(products.setKey, opts.setKey)] : [],
  });
  const delivered = sql`(${listings.priceCents} + coalesce(${listings.shippingCents}, 0))`;
  const rows = await db.with(...ctes)
    .select({
      listingId: listings.id, marketplace: listings.marketplace, url: listings.url,
      condition: listings.condition, language: listings.language, isReverseHolo: listings.isReverseHolo,
      sellerCountry: listings.sellerCountry, imageUrl: listings.imageUrl,
      priceCents: listings.priceCents, shippingCents: listings.shippingCents, currency: listings.currency,
      lastSeenAt: listings.lastSeenAt, edition: listings.edition, rarity: listings.rarity,
      productId: products.id, productName: products.name, kind: products.kind, setKey: products.setKey,
      cardmarketProductId: products.cardmarketId, reference: ranked.reference,
    })
    .from(ranked)
    .innerJoin(listings, eq(listings.id, ranked.id))
    .innerJoin(products, eq(products.id, listings.productId))
    .where(and(
      lte(ranked.rn, 2),
      gte(ranked.n, MIN_GROUP_SIZE),
      // The value and discount rules of scoreListing, in the same float8 arithmetic as JavaScript.
      gte(ranked.reference, settings.minBenchmarkCents),
      sql`(${ranked.reference} - ${delivered})::float8 / ${ranked.reference}::float8 >= ${settings.minDiscountPct}::float8`,
    ));
  if (rows.length === 0) return [];

  // Latest snapshot per product = greatest capturedAt, not the most recently inserted row.
  const snapshotRows = await db
    .selectDistinctOn([benchmarkSnapshots.productId], {
      productId: benchmarkSnapshots.productId, trendCents: benchmarkSnapshots.trendCents, trendHoloCents: benchmarkSnapshots.trendHoloCents,
    })
    .from(benchmarkSnapshots)
    .where(inArray(benchmarkSnapshots.productId, [...new Set(rows.map((r) => r.productId))]))
    .orderBy(benchmarkSnapshots.productId, desc(benchmarkSnapshots.capturedAt));
  const latest = new Map(snapshotRows.map((s) => [s.productId, s]));

  const views: DealView[] = rows.map((r) => {
    const snap = latest.get(r.productId);
    const kind = r.kind as ProductKind;
    const benchmark = enDeBenchmark(r.reference, opts.now);
    const condition = r.condition as Condition | null;
    const score = markStaleListing(
      scoreListing(
        { priceCents: r.priceCents, shippingCents: r.shippingCents, currency: r.currency, condition, language: r.language, kind },
        benchmark,
        dealSettingsFor(settings, r.setKey),
      ),
      r.lastSeenAt, opts.now, settings.maxListingAgeHours,
    );
    return {
      listingId: r.listingId, productName: r.productName, kind, marketplace: r.marketplace as Marketplace, url: r.url,
      condition, language: r.language, isReverseHolo: r.isReverseHolo, sellerCountry: r.sellerCountry, imageUrl: r.imageUrl,
      priceCents: r.priceCents, shippingCents: r.shippingCents, currency: r.currency, lastSeenAt: r.lastSeenAt,
      benchmark, score,
      edition: r.edition as Edition, rarity: r.rarity, setKey: r.setKey,
      cardmarketValueCents: snap ? (r.isReverseHolo ? snap.trendHoloCents : snap.trendCents) : null,
      cardmarketProductId: r.cardmarketProductId,
    };
  });

  return views
    .filter((v) => v.score.isDeal)
    .sort((a, b) =>
      byDescNullsLast(a.score.discountCents, b.score.discountCents)
      || byDescNullsLast(a.score.discountPct, b.score.discountPct)
      || b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
      || a.listingId - b.listingId);
}

export async function getLastCheckedAt(db: Db): Promise<Date | null> {
  const [row] = await db.select({ at: max(listings.lastSeenAt) }).from(listings);
  return row?.at ?? null;
}
