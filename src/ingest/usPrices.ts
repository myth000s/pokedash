import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { benchmarkSnapshots, products, usReferencePrices } from '@/db/schema';
import { HttpError } from '@/lib/http';
import { ZodError } from 'zod';
import type { PptClient } from '@/providers/ppt/client';

/** Stop before the free tier's daily credits run out. */
export const US_PRICE_MIN_REMAINING = 10;
const SINGLES_MIN_TREND_CENTS = 500;

export async function ingestUsReferencePrices(
  db: Db,
  client: PptClient,
  setKey: string,
  now: Date,
): Promise<{ fetched: number; alreadyToday: number; noPrice: number; failed: number; stoppedEarly: boolean }> {
  const day = now.toISOString().slice(0, 10);
  const candidates = await db
    .select({ id: products.id, kind: products.kind, tcgplayerId: products.tcgplayerId })
    .from(products)
    .where(and(eq(products.setKey, setKey), isNotNull(products.tcgplayerId)))
    .orderBy(products.id);
  const snapshots = await db
    .selectDistinctOn([benchmarkSnapshots.productId], { productId: benchmarkSnapshots.productId, trendCents: benchmarkSnapshots.trendCents })
    .from(benchmarkSnapshots)
    .orderBy(benchmarkSnapshots.productId, desc(benchmarkSnapshots.capturedAt));
  const trend = new Map(snapshots.map((s) => [s.productId, s.trendCents]));
  const done = new Set(
    (await db.select({ productId: usReferencePrices.productId }).from(usReferencePrices).where(eq(usReferencePrices.capturedDay, day))).map((r) => r.productId),
  );

  const result = { fetched: 0, alreadyToday: 0, noPrice: 0, failed: 0, stoppedEarly: false };
  for (const p of candidates) {
    if (p.kind !== 'sealed' && (trend.get(p.id) ?? 0) < SINGLES_MIN_TREND_CENTS) continue;
    if (done.has(p.id)) {
      result.alreadyToday++;
      continue;
    }
    // A row is stored for every attempt; usdCents null means "asked today, no price".
    let quote: { usdCents: number | null; dailyRemaining: number | null };
    let failed = false;
    try {
      quote = p.kind === 'sealed' ? await client.sealedQuote(p.tcgplayerId!) : await client.cardQuote(p.tcgplayerId!);
    } catch (err) {
      if ((err instanceof HttpError && err.status === 404) || err instanceof ZodError) {
        quote = { usdCents: null, dailyRemaining: null };
        failed = true;
      } else {
        // Rate limit, server or network trouble: keep what we have and try again tomorrow.
        result.stoppedEarly = true;
        break;
      }
    }
    await db
      .insert(usReferencePrices)
      .values({ productId: p.id, capturedAt: now, capturedDay: day, usdCents: quote.usdCents })
      .onConflictDoNothing({ target: [usReferencePrices.productId, usReferencePrices.capturedDay] });
    if (failed) result.failed++;
    else if (quote.usdCents === null) result.noPrice++;
    else result.fetched++;
    if (quote.dailyRemaining !== null && quote.dailyRemaining < US_PRICE_MIN_REMAINING) {
      result.stoppedEarly = true;
      break;
    }
  }
  return result;
}
