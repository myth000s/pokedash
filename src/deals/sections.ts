import { and, count, desc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { benchmarkSnapshots, fxRates, listings, products, usReferencePrices } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, type DealSettings } from '@/config/settings';
import { TRACKED_SETS } from '@/config/sets';
import { cheapestReference, type ConditionGroup } from '@/deals/reference';
import { conditionGroupSql, rankedOffers } from '@/deals/rankedOffers';
import { markStaleListing, scoreListing } from '@/scoring/score';
import { matchesQuery } from '@/lib/search';
import { byDescNullsLast, dealSettingsFor, enDeBenchmark } from '@/deals/feed';
import type { BenchmarkAssessment, Condition, Edition, ProductKind, ScoredListing } from '@/domain/types';

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

/** The latest Cardmarket trend per product (greatest capturedAt). */
async function latestTrends(db: Db, ids: number[]): Promise<Map<number, number | null>> {
  const rows = await db
    .selectDistinctOn([benchmarkSnapshots.productId], { productId: benchmarkSnapshots.productId, trendCents: benchmarkSnapshots.trendCents })
    .from(benchmarkSnapshots)
    .where(inArray(benchmarkSnapshots.productId, ids))
    .orderBy(benchmarkSnapshots.productId, desc(benchmarkSnapshots.capturedAt));
  return new Map(rows.map((r) => [r.productId, r.trendCents]));
}

const isWorthListing = (valueCents: number | null) => (valueCents ?? 0) >= SINGLES_MIN_VALUE_CENTS;

const MAX_US_AGE_MS = 7 * 24 * 3_600_000;
export const NO_RARITY = 'No rarity';

export interface SectionOffer {
  listingId: number; url: string; priceCents: number; language: string; sellerCountry: string | null; score: ScoredListing;
}

export interface SectionRow {
  productId: number; productName: string; kind: ProductKind; sealedType: SealedType | null; imageUrl: string | null;
  benchmark: BenchmarkAssessment;
  /** Cardmarket's all-language trend; shown only as a note. */
  cardmarketValueCents: number | null;
  us: { usdCents: number; eurCents: number } | null;
  offer: SectionOffer | null;
  offerCount: number;
  rarity: string | null; edition: Edition; cardmarketProductId: number;
}

export type SortKey = 'saving' | 'cheapest' | 'expensive';

const typeIndex = (t: SealedType | null) => SEALED_TYPES.findIndex((x) => x.key === t);

function ascNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** Orders rows by the chosen key; rows without an offer (or, for `saving`, without a value) go last. */
export function sortRows(rows: SectionRow[], sort: SortKey | undefined): SectionRow[] {
  const byName = (a: SectionRow, b: SectionRow) => a.productName.localeCompare(b.productName);
  const price = (r: SectionRow) => r.offer?.priceCents ?? null;
  const saving = (r: SectionRow) => r.offer?.score.discountPct ?? null;
  const compare: (a: SectionRow, b: SectionRow) => number =
    sort === 'cheapest' ? (a, b) => ascNullsLast(price(a), price(b)) || byName(a, b)
    : sort === 'expensive' ? (a, b) => byDescNullsLast(price(a), price(b)) || byName(a, b)
    : sort === 'saving' ? (a, b) => byDescNullsLast(saving(a), saving(b)) || byName(a, b)
    : (a, b) => typeIndex(a.sealedType) - typeIndex(b.sealedType)
      || byDescNullsLast(a.benchmark.valueCents, b.benchmark.valueCents)
      || byDescNullsLast(a.cardmarketValueCents, b.cardmarketValueCents) || byName(a, b);
  return [...rows].sort(compare);
}

interface SectionOpts {
  section: 'singles' | 'sealed'; now: Date; settings?: DealSettings; allSingles?: boolean; sealedType?: SealedType;
  query?: string; language?: 'en' | 'de'; edition?: Edition; rarities?: string[]; conditionGroup?: ConditionGroup; sort?: SortKey;
}

/**
 * The ranked EN/DE pool of one section: available EUR offers of one edition and condition group, regular
 * (not reverse holo) so the offer compares like with like. Sealed products have no condition: they count as Near Mint.
 */
function sectionPool(db: Db, setKeys: string[], kind: ProductKind, edition: Edition, group: ConditionGroup, now: Date, maxAgeHours: number, byLanguage: boolean) {
  return rankedOffers(db, {
    now, maxAgeHours, byLanguage,
    where: [
      inArray(products.setKey, setKeys), eq(products.kind, kind),
      eq(listings.edition, edition), eq(listings.isReverseHolo, false),
      sql`${conditionGroupSql()} = ${group}`,
    ],
  });
}

/** The market value: the median of the 3 cheapest fresh EN/DE offers (spec 8.8), or null. */
const valueOf = (r: { p1: number | null; p2: number | null; p3: number | null }) =>
  cheapestReference([r.p1, r.p2, r.p3].filter((p): p is number => p !== null));

async function loadRows(db: Db, setKeys: string[], opts: SectionOpts): Promise<SectionRow[]> {
  const settings = opts.settings ?? DEFAULT_DEAL_SETTINGS;
  const kind: ProductKind = opts.section === 'singles' ? 'single' : 'sealed';
  // Sealed products have no condition: they count as Near Mint.
  const group: ConditionGroup = kind === 'single' ? opts.conditionGroup ?? 'nm' : 'nm';
  const edition: Edition = opts.edition ?? 'unlimited';

  const prods = await db.select({
    id: products.id, name: products.name, categoryName: products.categoryName, imageUrl: products.imageUrl,
    tcgplayerId: products.tcgplayerId, rarity: products.rarity, cardmarketId: products.cardmarketId, setKey: products.setKey,
  }).from(products)
    .where(and(inArray(products.setKey, setKeys), eq(products.kind, kind)));
  if (prods.length === 0) return [];
  const ids = prods.map((p) => p.id);

  // Per product at most two offers come back: the cheapest of the pool (it carries the value), and the
  // cheapest in the chosen language. The pool is always EN and DE together; the language only picks the offer shown.
  const { ctes, ranked } = sectionPool(db, setKeys, kind, edition, group, opts.now, settings.maxListingAgeHours, !!opts.language);
  const [trends, offerRows, usRows, [fx]] = await Promise.all([
    latestTrends(db, ids),
    db.with(...ctes).select({
      productId: ranked.productId, rn: ranked.rn, n: ranked.n, p1: ranked.p1, p2: ranked.p2, p3: ranked.p3,
      reference: ranked.reference, langRank: ranked.langRank, langCount: ranked.langCount,
      listingId: listings.id, url: listings.url, priceCents: listings.priceCents, shippingCents: listings.shippingCents,
      currency: listings.currency, condition: listings.condition, language: listings.language,
      sellerCountry: listings.sellerCountry, lastSeenAt: listings.lastSeenAt,
    }).from(ranked)
      .innerJoin(listings, eq(listings.id, ranked.id))
      .where(opts.language
        ? or(eq(ranked.rn, 1), and(eq(ranked.language, opts.language), eq(ranked.langRank, 1)))
        : eq(ranked.rn, 1)),
    // A null usd_cents row means "asked, no price": use the newest row that has a price.
    db.selectDistinctOn([usReferencePrices.productId], {
      productId: usReferencePrices.productId, usdCents: usReferencePrices.usdCents, capturedAt: usReferencePrices.capturedAt,
    })
      .from(usReferencePrices)
      .where(and(inArray(usReferencePrices.productId, ids), isNotNull(usReferencePrices.usdCents)))
      .orderBy(usReferencePrices.productId, desc(usReferencePrices.capturedAt)),
    db.select().from(fxRates).orderBy(desc(fxRates.rateDate)).limit(1),
  ]);
  const cheapestByProduct = new Map(offerRows.filter((o) => o.rn === 1).map((o) => [o.productId, o]));
  const shownByProduct = opts.language
    ? new Map(offerRows.filter((o) => o.language === opts.language && o.langRank === 1).map((o) => [o.productId, o]))
    : cheapestByProduct;
  const usByProduct = new Map(usRows.map((u) => [u.productId, u]));
  const fxFresh = !!fx && opts.now.getTime() - new Date(`${fx.rateDate}T00:00:00Z`).getTime() <= MAX_US_AGE_MS;

  const wantedRarities = opts.rarities && opts.rarities.length > 0 ? new Set(opts.rarities) : null;
  const allRows: SectionRow[] = prods
    .filter((p) => !wantedRarities || wantedRarities.has(p.rarity ?? NO_RARITY))
    .map((p) => {
      const cheapest = cheapestByProduct.get(p.id);
      const shown = shownByProduct.get(p.id);
      const benchmark = enDeBenchmark(cheapest ? valueOf(cheapest) : null, opts.now);
      let offer: SectionOffer | null = null;
      if (shown) {
        // Judged like a deal: against the second-cheapest *other* offer of its group.
        const score = markStaleListing(
          scoreListing(
            {
              priceCents: shown.priceCents, shippingCents: shown.shippingCents, currency: shown.currency,
              condition: shown.condition as Condition | null, language: shown.language, kind,
            },
            enDeBenchmark(shown.reference, opts.now),
            dealSettingsFor(settings, p.setKey),
          ),
          shown.lastSeenAt, opts.now, settings.maxListingAgeHours,
        );
        offer = {
          listingId: shown.listingId, url: shown.url, priceCents: shown.priceCents,
          language: shown.language ?? '', sellerCountry: shown.sellerCountry, score,
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
        imageUrl: p.imageUrl, benchmark, cardmarketValueCents: trends.get(p.id) ?? null,
        us, offer, offerCount: shown ? (opts.language ? shown.langCount : shown.n) : 0,
        rarity: p.rarity, edition, cardmarketProductId: p.cardmarketId,
      };
    });

  const rows = opts.query ? allRows.filter((r) => matchesQuery(r.productName, opts.query!)) : allRows;
  const kept = opts.section === 'singles'
    ? rows.filter((r) => opts.allSingles || isWorthListing(r.benchmark.valueCents))
    : rows.filter((r) => !opts.sealedType || r.sealedType === opts.sealedType);
  return sortRows(kept, opts.sort);
}

export function getSectionRows(db: Db, opts: SectionOpts & { setKey: string }): Promise<SectionRow[]> {
  return loadRows(db, [opts.setKey], opts);
}

/** The distinct single rarities of a set (null: all tracked sets), sorted, with "No rarity" last when some single has none. */
export async function getAvailableRarities(db: Db, setKey: string | null): Promise<string[]> {
  const setKeys = setKey === null ? TRACKED_SETS.map((s) => s.key) : [setKey];
  const rows = await db.selectDistinct({ rarity: products.rarity }).from(products)
    .where(and(inArray(products.setKey, setKeys), eq(products.kind, 'single')));
  const named = rows.flatMap((r) => (r.rarity === null ? [] : [r.rarity])).sort((a, b) => a.localeCompare(b));
  return rows.some((r) => r.rarity === null) ? [...named, NO_RARITY] : named;
}

/** Tab counts; `setKey` null means across all tracked sets. Singles are counted the way getSectionRows shows them. */
export async function getSectionCounts(
  db: Db, setKey: string | null, now: Date = new Date(),
  opts: { edition?: Edition; conditionGroup?: ConditionGroup } = {},
): Promise<{ singles: number; sealed: number }> {
  const setKeys = setKey === null ? TRACKED_SETS.map((s) => s.key) : [setKey];
  const { ctes, ranked } = sectionPool(
    db, setKeys, 'single', opts.edition ?? 'unlimited', opts.conditionGroup ?? 'nm', now, DEFAULT_DEAL_SETTINGS.maxListingAgeHours, false,
  );
  const [cheapest, [sealed]] = await Promise.all([
    // One row per product with 3+ offers: its 3 cheapest prices.
    db.with(...ctes).select({ p1: ranked.p1, p2: ranked.p2, p3: ranked.p3 }).from(ranked)
      .where(and(eq(ranked.rn, 1), gte(ranked.n, 3))),
    db.select({ n: count() }).from(products).where(and(inArray(products.setKey, setKeys), eq(products.kind, 'sealed'))),
  ]);
  return { singles: cheapest.filter((r) => isWorthListing(valueOf(r))).length, sealed: sealed.n };
}
