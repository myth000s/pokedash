import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { rankedOffers } from './rankedOffers';
import { referenceValues, type PoolListing } from './reference';
import { dealSettingsFor, enDeBenchmark, getDealFeed } from './feed';
import { DEFAULT_DEAL_SETTINGS } from '@/config/settings';
import { markStaleListing, scoreListing } from '@/scoring/score';
import { listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import type { Condition, Edition, ProductKind } from '@/domain/types';
import { createTestDb } from '../../test/helpers/db';

const NOW = new Date('2026-10-19T12:00:00Z');
const HOUR = 3_600_000;
const MAX_AGE = DEFAULT_DEAL_SETTINGS.maxListingAgeHours;

/** A small deterministic PRNG (mulberry32), so a failing seed can be replayed. */
function prng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  return { next, pick };
}

const PRODUCTS: { setKey: string; kind: ProductKind }[] = [
  { setKey: '30th-celebration', kind: 'single' }, { setKey: '30th-celebration', kind: 'single' },
  { setKey: '30th-celebration', kind: 'sealed' }, { setKey: 'base-set', kind: 'single' },
  { setKey: 'base-set', kind: 'single' }, { setKey: 'base-set', kind: 'sealed' }, { setKey: 'jungle', kind: 'single' },
];
const CONDITIONS: (Condition | null)[] = ['mint', 'near_mint', 'near_mint', 'near_mint', 'slightly_played', 'moderately_played', 'played', 'poor', null];
const EDITIONS: Edition[] = ['unlimited', 'unlimited', 'first_edition', 'shadowless'];
const LANGUAGES: (string | null)[] = ['en', 'en', 'de', 'de', 'fr', null];
// Exactly 72 h is still fresh; a millisecond later is not.
const AGES = [0, 0, 0, HOUR, 71 * HOUR, 72 * HOUR, 72 * HOUR + 1, 100 * HOUR];
const FACTORS = [0.5, 0.7, 0.79, 0.8, 0.8, 0.81, 1, 1, 1, 1.05, 1.1];

/** Inserts a varied pool: ties, groups of every size, mixed editions/conditions/reverse holo, stale, sealed nulls, non-EUR, other languages. */
async function seedPool(db: Db, seed: number) {
  const r = prng(seed);
  const ids: { id: number; kind: ProductKind }[] = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const [row] = await db.insert(products).values({
      cardmarketId: seed * 100 + i, name: `P${i}`, kind: p.kind, categoryName: 'x', cardmarketExpansionId: 1, setKey: p.setKey, updatedAt: NOW,
    }).returning({ id: products.id });
    ids.push({ id: row.id, kind: p.kind });
  }
  const rows: (typeof listings.$inferInsert)[] = [];
  for (const p of ids) {
    const base = r.pick([600, 1000, 5000]);
    const count = Math.floor(r.next() * 70);
    for (let i = 0; i < count; i++) {
      const kindCondition = p.kind === 'sealed' ? r.pick<Condition | null>([null, null, null, 'near_mint', 'slightly_played']) : r.pick(CONDITIONS);
      rows.push({
        marketplace: 'cardtrader', externalId: `s${seed}-${p.id}-${i}`, productId: p.id, title: 'x', url: 'https://x',
        priceCents: Math.round(base * r.pick(FACTORS)),
        currency: r.next() < 0.93 ? 'EUR' : 'USD',
        shippingCents: r.pick([null, 0, 150, 300]),
        condition: kindCondition,
        language: r.pick(LANGUAGES),
        isReverseHolo: p.kind === 'single' && r.next() < 0.2,
        edition: r.pick(EDITIONS),
        available: r.next() < 0.92,
        firstSeenAt: NOW, lastSeenAt: new Date(NOW.getTime() - r.pick(AGES)),
      });
    }
  }
  // Fixed groups of exactly 3, 4 and 5 Near Mint EN offers, on a product of their own.
  const [fixed] = await db.insert(products).values({
    cardmarketId: seed * 100 + 99, name: 'Fixed', kind: 'single', categoryName: 'x', cardmarketExpansionId: 1, setKey: 'base-set', updatedAt: NOW,
  }).returning({ id: products.id });
  for (const [g, prices] of [[700, 1000, 1000], [700, 1000, 1000, 1000], [700, 700, 1000, 1000, 1100]].entries()) {
    for (const [i, priceCents] of prices.entries()) {
      rows.push({
        marketplace: 'cardtrader', externalId: `fixed${seed}-${g}-${i}`, productId: fixed.id, title: 'x', url: 'https://x',
        priceCents, currency: 'EUR', condition: 'near_mint', language: 'en', isReverseHolo: g === 1,
        edition: (['unlimited', 'first_edition', 'shadowless'] as const)[g], firstSeenAt: NOW, lastSeenAt: NOW,
      });
    }
  }
  await db.insert(listings).values(rows);
}

/** The whole listings table as the oracle sees it (sealed with no condition counts as Near Mint). */
async function oraclePool(db: Db): Promise<(PoolListing & { kind: ProductKind; shippingCents: number | null; setKey: string })[]> {
  const rows = await db.select({ l: listings, kind: products.kind, setKey: products.setKey })
    .from(listings).innerJoin(products, eq(products.id, listings.productId));
  return rows.map(({ l, kind, setKey }) => ({
    id: l.id, productId: l.productId, edition: l.edition as Edition,
    condition: kind === 'sealed' && l.condition === null ? 'near_mint' : l.condition as Condition | null,
    isReverseHolo: l.isReverseHolo, priceCents: l.priceCents, language: l.language, currency: l.currency,
    available: l.available, lastSeenAt: l.lastSeenAt, kind: kind as ProductKind, shippingCents: l.shippingCents, setKey,
  }));
}

describe('rankedOffers agrees with referenceValues', () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`gives every eligible listing the oracle's reference, and getDealFeed the oracle's deals (seed ${seed})`, async () => {
      const db = await createTestDb();
      await seedPool(db, seed);
      const pool = await oraclePool(db);
      const oracle = referenceValues(pool, NOW, MAX_AGE);

      const { ctes, ranked } = rankedOffers(db, { now: NOW, maxAgeHours: MAX_AGE });
      const sqlRows = await db.with(...ctes).select({ id: ranked.id, reference: ranked.reference }).from(ranked);
      const fromSql = new Map(sqlRows.map((row) => [row.id, row.reference]));
      expect(fromSql.size).toBeGreaterThan(50);
      expect([...fromSql.values()].filter((v) => v !== null).length).toBeGreaterThan(10);
      expect(new Map([...fromSql].sort((a, b) => a[0] - b[0]))).toEqual(new Map([...oracle].sort((a, b) => a[0] - b[0])));

      // The old in-memory feed: score every listing against its oracle reference.
      const expected = pool.flatMap((l) => {
        if (!oracle.has(l.id)) return [];
        const score = markStaleListing(scoreListing(
          { priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, language: l.language, kind: l.kind, condition: l.condition },
          enDeBenchmark(oracle.get(l.id) ?? null, NOW), dealSettingsFor(DEFAULT_DEAL_SETTINGS, l.setKey),
        ), l.lastSeenAt, NOW, MAX_AGE);
        return score.isDeal ? [{ listingId: l.id, valueCents: oracle.get(l.id), discountCents: score.discountCents }] : [];
      });
      const feed = await getDealFeed(db, { now: NOW });
      expect(expected.length).toBeGreaterThan(0);
      const byId = (a: { listingId: number }, b: { listingId: number }) => a.listingId - b.listingId;
      expect(feed.map((d) => ({ listingId: d.listingId, valueCents: d.benchmark.valueCents, discountCents: d.score.discountCents })).sort(byId))
        .toEqual(expected.sort(byId));
    });
  }

  it('gives the 3 fixed groups of 3, 4 and 5 offers the expected references', async () => {
    const db = await createTestDb();
    await seedPool(db, 9);
    const { ctes, ranked } = rankedOffers(db, { now: NOW, maxAgeHours: MAX_AGE });
    const rows = await db.with(...ctes).select({ ext: listings.externalId, reference: ranked.reference, rn: ranked.rn, n: ranked.n, p2: ranked.p2 })
      .from(ranked).innerJoin(listings, eq(listings.id, ranked.id));
    const ref = (g: number) => rows.filter((row) => row.ext.startsWith(`fixed9-${g}-`)).sort((a, b) => a.rn - b.rn);
    expect(ref(0).map((row) => row.reference)).toEqual([null, null, null]); // 3 offers: too few others
    expect(ref(1).map((row) => row.reference)).toEqual([1000, 1000, 1000, 1000]);
    // Tie at 700: both cheapest are judged against the 3rd cheapest; the rest against the 2nd.
    expect(ref(2).map((row) => row.reference)).toEqual([1000, 1000, 700, 700, 700]);
    expect(ref(2).map((row) => [row.n, row.p2])).toEqual(Array(5).fill([5, 700]));
  });
});
