import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { benchmarkSnapshots, fxRates, listings, products, usReferencePrices } from '@/db/schema';
import type { Db } from '@/db/client';
import { DEFAULT_DEAL_SETTINGS, type DealSettings } from '@/config/settings';
import { TRACKED_SETS } from '@/config/sets';
import { cheapestReference, GROUP_CONDITIONS, isFresh, type ConditionGroup } from '@/deals/reference';
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

type SnapshotRow = typeof benchmarkSnapshots.$inferSelect;

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

/** The SQL filters shared by the row query and the count: available EN/DE EUR offers of one edition and condition group. */
function offerFilters(kind: ProductKind, edition: Edition, group: ConditionGroup, language?: 'en' | 'de'): SQL[] {
  const inGroup = inArray(listings.condition, GROUP_CONDITIONS[group]);
  return [
    eq(listings.available, true),
    inArray(listings.language, language ? [language] : ['en', 'de']),
    eq(listings.currency, 'EUR'),
    eq(listings.edition, edition),
    // Sealed products have no condition: they count as Near Mint.
    kind === 'sealed' ? or(isNull(listings.condition), inGroup)! : inGroup,
  ];
}

/** The reference value of one product: the median of its 3 cheapest fresh regular offers, or null. */
function referenceOf(offers: { priceCents: number; lastSeenAt: Date; isReverseHolo: boolean }[], kind: ProductKind, now: Date, maxAgeHours: number): number | null {
  return cheapestReference(offers
    .filter((l) => !(kind === 'single' && l.isReverseHolo) && isFresh(l.lastSeenAt, now, maxAgeHours))
    .map((l) => l.priceCents));
}

async function loadRows(db: Db, setKeys: string[], opts: SectionOpts): Promise<SectionRow[]> {
  const settings = opts.settings ?? DEFAULT_DEAL_SETTINGS;
  const kind: ProductKind = opts.section === 'singles' ? 'single' : 'sealed';
  // Sealed products have no condition: they count as Near Mint.
  const group: ConditionGroup = kind === 'single' ? opts.conditionGroup ?? 'nm' : 'nm';
  const edition: Edition = opts.edition ?? 'unlimited';

  const prods = await db.select().from(products)
    .where(and(inArray(products.setKey, setKeys), eq(products.kind, kind)));
  if (prods.length === 0) return [];
  const ids = prods.map((p) => p.id);

  const snapshots = await latestSnapshots(db, ids);

  const listingRows = await db.select().from(listings).where(and(
    inArray(listings.productId, ids),
    ...offerFilters(kind, edition, group, opts.language),
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

  const wantedRarities = opts.rarities && opts.rarities.length > 0 ? new Set(opts.rarities) : null;
  const allRows: SectionRow[] = prods
    .filter((p) => !wantedRarities || wantedRarities.has(p.rarity ?? NO_RARITY))
    .map((p) => {
      const candidates = byProduct.get(p.id) ?? [];
      // The value comes from regular (non-reverse-holo) singles, so the offer compares like with like.
      const comparable = kind === 'single' ? candidates.filter((l) => !l.isReverseHolo) : candidates;
      const benchmark = enDeBenchmark(referenceOf(comparable, kind, opts.now, settings.maxListingAgeHours), opts.now);
      const cheapest = comparable.reduce<(typeof candidates)[number] | null>(
        (best, l) => (!best || l.priceCents < best.priceCents || (l.priceCents === best.priceCents && l.id < best.id) ? l : best),
        null,
      );
      let offer: SectionOffer | null = null;
      if (cheapest) {
        const dealSettings = dealSettingsFor(settings, p.setKey);
        const score = markStaleListing(
          scoreListing(
            {
              priceCents: cheapest.priceCents, shippingCents: cheapest.shippingCents, currency: cheapest.currency,
              condition: cheapest.condition as Condition | null, language: cheapest.language, kind,
            },
            benchmark,
            dealSettings,
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
        imageUrl: p.imageUrl, benchmark, cardmarketValueCents: snapshots.get(p.id)?.trendCents ?? null,
        us, offer, offerCount: candidates.length,
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
  const maxAge = DEFAULT_DEAL_SETTINGS.maxListingAgeHours;
  const [offers, [sealed]] = await Promise.all([
    db.select({
      productId: listings.productId, priceCents: listings.priceCents, lastSeenAt: listings.lastSeenAt, isReverseHolo: listings.isReverseHolo,
    }).from(listings).innerJoin(products, eq(listings.productId, products.id)).where(and(
      inArray(products.setKey, setKeys), eq(products.kind, 'single'),
      gte(listings.lastSeenAt, new Date(now.getTime() - maxAge * 3_600_000)),
      ...offerFilters('single', opts.edition ?? 'unlimited', opts.conditionGroup ?? 'nm'),
    )),
    db.select({ n: count() }).from(products).where(and(inArray(products.setKey, setKeys), eq(products.kind, 'sealed'))),
  ]);
  const byProduct = new Map<number, typeof offers>();
  for (const o of offers) {
    const arr = byProduct.get(o.productId);
    if (arr) arr.push(o); else byProduct.set(o.productId, [o]);
  }
  const singles = [...byProduct.values()].filter((os) => isWorthListing(referenceOf(os, 'single', now, maxAge))).length;
  return { singles, sealed: sealed.n };
}
