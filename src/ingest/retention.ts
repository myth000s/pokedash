import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { RETENTION_DAYS } from '@/config/settings';
import { benchmarkSnapshots, listingPriceHistory, listings, usReferencePrices } from '@/db/schema';

const DAY_MS = 86_400_000;
const cutoff = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

export interface CleanupResult {
  listings: number;
  priceHistory: number;
  usPrices: number;
  benchmarks: number;
}

/** Deletes rows past their retention in one transaction. */
export async function cleanupOldData(db: Db, now: Date): Promise<CleanupResult> {
  return db.transaction(async (tx) => {
    const expiring = tx
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.available, false), lt(listings.lastSeenAt, cutoff(now, RETENTION_DAYS.unavailableListings))));
    // History of expiring listings goes first (foreign key), then old history of the rest.
    const expiringHistory = await tx
      .delete(listingPriceHistory)
      .where(inArray(listingPriceHistory.listingId, expiring))
      .returning({ id: listingPriceHistory.id });
    const oldHistory = await tx
      .delete(listingPriceHistory)
      .where(lt(listingPriceHistory.observedAt, cutoff(now, RETENTION_DAYS.listingPriceHistory)))
      .returning({ id: listingPriceHistory.id });
    const deletedListings = await tx
      .delete(listings)
      .where(and(eq(listings.available, false), lt(listings.lastSeenAt, cutoff(now, RETENTION_DAYS.unavailableListings))))
      .returning({ id: listings.id });
    const us = await tx
      .delete(usReferencePrices)
      .where(lt(usReferencePrices.capturedAt, cutoff(now, RETENTION_DAYS.usReferencePrices)))
      .returning({ id: usReferencePrices.id });
    const bench = await tx
      .delete(benchmarkSnapshots)
      .where(lt(benchmarkSnapshots.capturedAt, cutoff(now, RETENTION_DAYS.benchmarkSnapshots)))
      .returning({ id: benchmarkSnapshots.id });
    return {
      listings: deletedListings.length,
      priceHistory: expiringHistory.length + oldHistory.length,
      usPrices: us.length,
      benchmarks: bench.length,
    };
  });
}

export async function databaseSizeBytes(db: Db): Promise<number> {
  const res = await db.execute(sql`select pg_database_size(current_database())::float8 as size`);
  // postgres-js returns the rows as an array, PGlite wraps them in { rows }.
  const rows = (Array.isArray(res) ? res : (res as unknown as { rows: unknown[] }).rows) as { size: number | string }[];
  return Number(rows[0].size);
}
