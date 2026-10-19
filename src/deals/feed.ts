import { desc, eq, inArray, max } from 'drizzle-orm';
import { benchmarkSnapshots, listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, type DealSettings } from '@/config/settings';
import { assessBenchmark } from '@/scoring/benchmark';
import { scoreListing } from '@/scoring/score';
import type {
  BenchmarkAssessment, BenchmarkSnapshot, Condition, Marketplace, ProductKind, ScoredListing,
} from '@/domain/types';

export interface DealView {
  listingId: number; productName: string; kind: ProductKind; marketplace: Marketplace; url: string;
  condition: Condition | null; language: string | null; isReverseHolo: boolean;
  priceCents: number; shippingCents: number | null; currency: string; lastSeenAt: Date;
  benchmark: BenchmarkAssessment; score: ScoredListing;
}

type SnapshotRow = typeof benchmarkSnapshots.$inferSelect;

function toSnapshot(row: SnapshotRow): BenchmarkSnapshot {
  return {
    capturedAt: row.capturedAt,
    avg: row.avgCents, low: row.lowCents, trend: row.trendCents,
    avg1: row.avg1Cents, avg7: row.avg7Cents, avg30: row.avg30Cents,
    avgHolo: row.avgHoloCents, lowHolo: row.lowHoloCents, trendHolo: row.trendHoloCents,
    avg1Holo: row.avg1HoloCents, avg7Holo: row.avg7HoloCents, avg30Holo: row.avg30HoloCents,
  };
}

function emptySnapshot(capturedAt: Date): BenchmarkSnapshot {
  return {
    capturedAt,
    avg: null, low: null, trend: null, avg1: null, avg7: null, avg30: null,
    avgHolo: null, lowHolo: null, trendHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null,
  };
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
    .where(eq(listings.available, true));
  if (rows.length === 0) return [];

  // Latest snapshot per product = greatest capturedAt, not the most recently inserted row.
  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const snapshotRows = await db
    .select()
    .from(benchmarkSnapshots)
    .where(inArray(benchmarkSnapshots.productId, productIds))
    .orderBy(desc(benchmarkSnapshots.capturedAt));
  const latest = new Map<number, SnapshotRow>();
  for (const s of snapshotRows) if (!latest.has(s.productId)) latest.set(s.productId, s);

  const views: DealView[] = rows.map(({ listing: l, product: p }) => {
    const snap = latest.get(p.id);
    const kind = p.kind as ProductKind;
    const benchmark = assessBenchmark(snap ? toSnapshot(snap) : emptySnapshot(opts.now), {
      kind, reverseHolo: l.isReverseHolo, now: opts.now, maxAgeHours: settings.maxBenchmarkAgeHours,
    });
    const condition = l.condition as Condition | null;
    const score = scoreListing(
      { priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, condition, language: l.language, kind },
      benchmark,
      settings,
    );
    return {
      listingId: l.id, productName: p.name, kind, marketplace: l.marketplace as Marketplace, url: l.url,
      condition, language: l.language, isReverseHolo: l.isReverseHolo,
      priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, lastSeenAt: l.lastSeenAt,
      benchmark, score,
    };
  });

  return views
    .filter((v) => opts.includeNonDeals || v.score.isDeal)
    .sort((a, b) => {
      const pa = a.score.discountPct;
      const pb = b.score.discountPct;
      if (pa !== pb) {
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      }
      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    });
}

export async function getLastCheckedAt(db: Db): Promise<Date | null> {
  const [row] = await db.select({ at: max(listings.lastSeenAt) }).from(listings);
  return row?.at ?? null;
}
