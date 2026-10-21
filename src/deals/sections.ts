import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { benchmarkSnapshots, fxRates, listings, products, usReferencePrices } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, type DealSettings } from '@/config/settings';
import { assessBenchmark } from '@/scoring/benchmark';
import { markStaleListing, scoreListing } from '@/scoring/score';
import { matchesQuery } from '@/lib/search';
import { byDescNullsLast, emptySnapshot, toSnapshot } from '@/deals/feed';
import type { BenchmarkAssessment, Condition, ProductKind, ScoredListing } from '@/domain/types';

export type SealedType = 'etb' | 'bundles-displays' | 'boosters' | 'collections' | 'tins' | 'blisters' | 'battle-decks' | 'other';

export const SEALED_TYPES: readonly { key: SealedType; label: string; category: string | null }[] = [
  { key: 'etb', label: 'Elite Trainer Boxes', category: 'Pokémon Elite Trainer Boxes' },
  { key: 'bundles-displays', label: 'Booster Bundles & Displays', category: 'Pokémon Display' },
  { key: 'boosters', label: 'Boosters', category: 'Pokémon Booster' },
  { key: 'collections', label: 'Collections & UPCs', category: 'Pokémon Box Set' },
  { key: 'tins', label: 'Tins', category: 'Pokémon Tins' },
  { key: 'blisters', label: 'Blisters', category: 'Pokémon Blisters' },
  { key: 'battle-decks', label: 'Battle Decks', category: 'Pokémon Theme Decks' },
  { key: 'other', label: 'Other', category: null },
];

export function sealedTypeOf(categoryName: string): SealedType {
  return SEALED_TYPES.find((t) => t.category === categoryName)?.key ?? 'other';
}

export const SINGLES_MIN_VALUE_CENTS = 500;

type SnapshotRow = typeof benchmarkSnapshots.$inferSelect;

function marketValueOf(snapshot: SnapshotRow | undefined, kind: ProductKind, now: Date, settings: DealSettings): number | null {
  return assessBenchmark(snapshot ? toSnapshot(snapshot) : emptySnapshot(now), {
    kind, reverseHolo: false, now, maxAgeHours: settings.maxBenchmarkAgeHours,
  }).valueCents;
}

async function latestSnapshots(db: Db, ids: number[]): Promise<Map<number, SnapshotRow>> {
  const rows = await db
    .selectDistinctOn([benchmarkSnapshots.productId])
    .from(benchmarkSnapshots)
    .where(inArray(benchmarkSnapshots.productId, ids))
    .orderBy(benchmarkSnapshots.productId, desc(benchmarkSnapshots.capturedAt));
  return new Map(rows.map((s) => [s.productId, s]));
}

const isWorthListing = (valueCents: number | null) => (valueCents ?? 0) >= SINGLES_MIN_VALUE_CENTS;

const MAX_US_AGE_MS = 7 * 24 * 3_600_000;

export interface SectionOffer {
  listingId: number; url: string; priceCents: number; language: string; sellerCountry: string | null; score: ScoredListing;
}

export interface SectionRow {
  productId: number; productName: string; kind: ProductKind; sealedType: SealedType | null; imageUrl: string | null;
  benchmark: BenchmarkAssessment;
  us: { usdCents: number; eurCents: number } | null;
  offer: SectionOffer | null;
  offerCount: number;
}

export async function getSectionRows(
  db: Db,
  opts: { section: 'singles' | 'sealed'; setKey: string; now: Date; settings?: DealSettings; allSingles?: boolean; sealedType?: SealedType;
    query?: string; language?: 'en' | 'de' },
): Promise<SectionRow[]> {
  const settings = opts.settings ?? DEFAULT_DEAL_SETTINGS;
  const kind: ProductKind = opts.section === 'singles' ? 'single' : 'sealed';

  const prods = await db.select().from(products)
    .where(and(eq(products.setKey, opts.setKey), eq(products.kind, kind)));
  if (prods.length === 0) return [];
  const ids = prods.map((p) => p.id);

  const snapshots = await latestSnapshots(db, ids);

  const listingRows = await db.select().from(listings).where(and(
    inArray(listings.productId, ids),
    eq(listings.available, true),
    inArray(listings.language, opts.language ? [opts.language] : ['en', 'de']),
    eq(listings.currency, 'EUR'),
    ...(kind === 'single' ? [inArray(listings.condition, ['mint', 'near_mint'])] : []),
  ));
  const byProduct = new Map<number, typeof listingRows>();
  for (const l of listingRows) {
    const arr = byProduct.get(l.productId);
    if (arr) arr.push(l); else byProduct.set(l.productId, [l]);
  }

  // A null usd_cents row means "asked, no price": use the newest row that has a price.
  const usRows = await db
    .selectDistinctOn([usReferencePrices.productId])
    .from(usReferencePrices)
    .where(and(inArray(usReferencePrices.productId, ids), isNotNull(usReferencePrices.usdCents)))
    .orderBy(usReferencePrices.productId, desc(usReferencePrices.capturedAt));
  const usByProduct = new Map(usRows.map((u) => [u.productId, u]));

  const [fx] = await db.select().from(fxRates).orderBy(desc(fxRates.rateDate)).limit(1);
  const fxFresh = !!fx && opts.now.getTime() - new Date(`${fx.rateDate}T00:00:00Z`).getTime() <= MAX_US_AGE_MS;

  const allRows: SectionRow[] = prods.map((p) => {
    const snapshot = snapshots.get(p.id);
    const assess = (reverseHolo: boolean) =>
      assessBenchmark(snapshot ? toSnapshot(snapshot) : emptySnapshot(opts.now), {
        kind, reverseHolo, now: opts.now, maxAgeHours: settings.maxBenchmarkAgeHours,
      });
    const benchmark = assess(false);

    const candidates = byProduct.get(p.id) ?? [];
    // The market value shown for singles is the non-holo trend, so compare like with like.
    const comparable = kind === 'single' ? candidates.filter((l) => !l.isReverseHolo) : candidates;
    const cheapest = comparable.reduce<(typeof candidates)[number] | null>(
      (best, l) => (!best || l.priceCents < best.priceCents || (l.priceCents === best.priceCents && l.id < best.id) ? l : best),
      null,
    );
    let offer: SectionOffer | null = null;
    if (cheapest) {
      const score = markStaleListing(
        scoreListing(
          {
            priceCents: cheapest.priceCents, shippingCents: cheapest.shippingCents, currency: cheapest.currency,
            condition: cheapest.condition as Condition | null, language: cheapest.language, kind,
          },
          assess(cheapest.isReverseHolo),
          settings,
        ),
        cheapest.lastSeenAt, opts.now, settings.maxListingAgeHours,
      );
      offer = {
        listingId: cheapest.id, url: cheapest.url, priceCents: cheapest.priceCents,
        language: cheapest.language ?? '', sellerCountry: cheapest.sellerCountry, score,
      };
    }

    const usRow = usByProduct.get(p.id);
    const us = p.tcgplayerId !== null && usRow && usRow.usdCents !== null && fxFresh
      && opts.now.getTime() - usRow.capturedAt.getTime() <= MAX_US_AGE_MS
      ? { usdCents: usRow.usdCents, eurCents: Math.round(usRow.usdCents / fx.usdPerEur) }
      : null;

    return {
      productId: p.id, productName: p.name, kind,
      sealedType: kind === 'sealed' ? sealedTypeOf(p.categoryName) : null,
      imageUrl: p.imageUrl, benchmark, us, offer, offerCount: candidates.length,
    };
  });

  const rows = opts.query ? allRows.filter((r) => matchesQuery(r.productName, opts.query!)) : allRows;

  if (opts.section === 'singles') {
    return rows
      .filter((r) => opts.allSingles || isWorthListing(r.benchmark.valueCents))
      .sort((a, b) => byDescNullsLast(a.benchmark.valueCents, b.benchmark.valueCents) || a.productName.localeCompare(b.productName));
  }
  const typeIndex = (t: SealedType | null) => SEALED_TYPES.findIndex((x) => x.key === t);
  return rows
    .filter((r) => !opts.sealedType || r.sealedType === opts.sealedType)
    .sort((a, b) =>
      typeIndex(a.sealedType) - typeIndex(b.sealedType)
      || byDescNullsLast(a.benchmark.valueCents, b.benchmark.valueCents)
      || a.productName.localeCompare(b.productName));
}

export async function getSectionCounts(
  db: Db, setKey: string, now: Date = new Date(),
): Promise<{ singles: number; sealed: number }> {
  const prods = await db.select({ id: products.id, kind: products.kind }).from(products).where(eq(products.setKey, setKey));
  const singleIds = prods.filter((p) => p.kind === 'single').map((p) => p.id);
  const snapshots = singleIds.length ? await latestSnapshots(db, singleIds) : new Map<number, SnapshotRow>();
  return {
    singles: singleIds.filter((id) => isWorthListing(marketValueOf(snapshots.get(id), 'single', now, DEFAULT_DEAL_SETTINGS))).length,
    sealed: prods.filter((p) => p.kind === 'sealed').length,
  };
}
