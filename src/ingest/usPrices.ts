import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { benchmarkSnapshots, products, usReferencePrices } from '@/db/schema';
import { HttpError } from '@/lib/http';
import { describeError } from '@/lib/errors';
import { SINGLES_MIN_VALUE_CENTS } from '@/deals/sections';
import { ZodError } from 'zod';
import type { PptClient } from '@/providers/ppt/client';

/** Stop before the free tier's daily credits run out. */
export const US_PRICE_MIN_REMAINING = 10;
/** Our own ceiling on attempts per UTC day and set, below the free tier's 100 credits. */
export const US_PRICE_DAILY_CAP = 90;

export interface UsPriceResult {
  fetched: number; alreadyToday: number; noPrice: number; failed: number;
  stoppedEarly: boolean; stopReason: 'credits' | 'error' | null; error: string | null;
}

export async function ingestUsReferencePrices(
  db: Db,
  client: PptClient,
  setKey: string,
  now: Date,
  opts: { dailyCap?: number } = {},
): Promise<UsPriceResult> {
  const dailyCap = opts.dailyCap ?? US_PRICE_DAILY_CAP;
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
  // Sealed products first (they are few and valuable), then singles; each by value, highest first.
  const valueOf = (id: number) => trend.get(id) ?? 0;
  const queue = [...candidates].sort(
    (a, b) => Number(b.kind === 'sealed') - Number(a.kind === 'sealed') || valueOf(b.id) - valueOf(a.id) || a.id - b.id,
  );
  const done = new Set(
    (await db.select({ productId: usReferencePrices.productId }).from(usReferencePrices).where(eq(usReferencePrices.capturedDay, day))).map((r) => r.productId),
  );

  // Attempts already made today for this set (rows exist for every attempt, even without a price).
  const [attempts] = await db
    .select({ n: count() })
    .from(usReferencePrices)
    .innerJoin(products, eq(usReferencePrices.productId, products.id))
    .where(and(eq(usReferencePrices.capturedDay, day), eq(products.setKey, setKey)));
  let attemptsToday = attempts?.n ?? 0;

  const result: UsPriceResult = { fetched: 0, alreadyToday: 0, noPrice: 0, failed: 0, stoppedEarly: false, stopReason: null, error: null };
  for (const p of queue) {
    if (p.kind !== 'sealed' && valueOf(p.id) < SINGLES_MIN_VALUE_CENTS) continue;
    if (done.has(p.id)) {
      result.alreadyToday++;
      continue;
    }
    if (attemptsToday >= dailyCap) {
      result.stoppedEarly = true;
      result.stopReason = 'credits';
      break;
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
        if (err instanceof HttpError && err.status === 429) {
          result.stopReason = 'credits';
        } else {
          result.stopReason = 'error';
          result.error = describeError(err);
        }
        break;
      }
    }
    await db
      .insert(usReferencePrices)
      .values({ productId: p.id, capturedAt: now, capturedDay: day, usdCents: quote.usdCents })
      .onConflictDoNothing({ target: [usReferencePrices.productId, usReferencePrices.capturedDay] });
    attemptsToday++;
    if (failed) result.failed++;
    else if (quote.usdCents === null) result.noPrice++;
    else result.fetched++;
    if (quote.dailyRemaining !== null && quote.dailyRemaining < US_PRICE_MIN_REMAINING) {
      result.stoppedEarly = true;
      result.stopReason = 'credits';
      break;
    }
  }
  return result;
}
