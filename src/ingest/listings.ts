import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { listingPriceHistory, listings, products } from '@/db/schema';
import type { Db } from '@/db/client';
import type { TrackedSet } from '@/config/sets';
import type { ListingProvider } from '@/providers/types';

export interface IngestListingsResult {
  upserted: number;
  skipped: number;
  markedUnavailable: number;
  skipReasons: Record<string, number>;
}

const WRITE_BATCH_SIZE = 500;

// On conflict, take every column from the incoming row except first_seen_at.
const UPSERT_SET = {
  productId: sql`excluded.product_id`,
  title: sql`excluded.title`,
  url: sql`excluded.url`,
  priceCents: sql`excluded.price_cents`,
  currency: sql`excluded.currency`,
  shippingCents: sql`excluded.shipping_cents`,
  condition: sql`excluded.condition`,
  language: sql`excluded.language`,
  isReverseHolo: sql`excluded.is_reverse_holo`,
  sellerCountry: sql`excluded.seller_country`,
  imageUrl: sql`excluded.image_url`,
  available: sql`excluded.available`,
  lastSeenAt: sql`excluded.last_seen_at`,
};

export async function ingestListings(
  db: Db,
  provider: ListingProvider,
  set: TrackedSet,
  now: Date,
): Promise<IngestListingsResult> {
  const setProducts = await db
    .select({ id: products.id, cardmarketId: products.cardmarketId })
    .from(products)
    .where(eq(products.setKey, set.key));
  const productIdByCardmarketId = new Map(setProducts.map((p) => [p.cardmarketId, p.id]));

  // Fetch first: if the provider throws, nothing has been written.
  const result = await provider.fetchListings(set, new Set(productIdByCardmarketId.keys()));

  const marketplace = provider.marketplace;
  const existingRows = await db
    .select({
      id: listings.id,
      externalId: listings.externalId,
      priceCents: listings.priceCents,
      shippingCents: listings.shippingCents,
    })
    .from(listings)
    .where(eq(listings.marketplace, marketplace));
  const existing = new Map(existingRows.map((r) => [r.externalId, r]));

  const skipReasons: Record<string, number> = {};
  let skipped = 0;
  const skip = (reason: string) => {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };
  for (const s of result.skipped) skip(s.reason);

  return db.transaction(async (tx) => {
    for (const m of result.products) {
      const productId = productIdByCardmarketId.get(m.cardmarketProductId);
      if (productId === undefined) continue;
      await tx.update(products).set({ imageUrl: m.imageUrl, tcgplayerId: m.tcgplayerId }).where(eq(products.id, productId));
    }
    // Last occurrence wins, as the old one-by-one upsert did; Postgres rejects a batch
    // that updates the same row twice.
    const rowsByExternalId = new Map<string, typeof listings.$inferInsert>();
    let upserted = 0;
    for (const l of result.listings) {
      const productId = productIdByCardmarketId.get(l.cardmarketProductId);
      if (productId === undefined) {
        skip('Untracked product');
        continue;
      }
      rowsByExternalId.set(l.externalId, {
        marketplace,
        externalId: l.externalId,
        firstSeenAt: now,
        productId,
        title: l.title,
        url: l.url,
        priceCents: l.priceCents,
        currency: l.currency,
        shippingCents: l.shippingCents,
        condition: l.condition,
        language: l.language,
        isReverseHolo: l.isReverseHolo,
        sellerCountry: l.sellerCountry,
        imageUrl: l.imageUrl,
        available: true,
        lastSeenAt: now,
      });
      upserted += 1;
    }

    // Each statement is a round trip to the hosted database, so write in batches.
    const rows = [...rowsByExternalId.values()];
    const history: (typeof listingPriceHistory.$inferInsert)[] = [];
    for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
      const batch = rows.slice(i, i + WRITE_BATCH_SIZE);
      const written = await tx
        .insert(listings)
        .values(batch)
        .onConflictDoUpdate({ target: [listings.marketplace, listings.externalId], set: UPSERT_SET })
        .returning({ id: listings.id, externalId: listings.externalId });
      const idByExternalId = new Map(written.map((w) => [w.externalId, w.id]));
      for (const row of batch) {
        const prev = existing.get(row.externalId);
        if (!prev || prev.priceCents !== row.priceCents || prev.shippingCents !== row.shippingCents) {
          history.push({
            listingId: idByExternalId.get(row.externalId)!,
            priceCents: row.priceCents,
            shippingCents: row.shippingCents,
            observedAt: now,
          });
        }
      }
    }
    for (let i = 0; i < history.length; i += WRITE_BATCH_SIZE) {
      await tx.insert(listingPriceHistory).values(history.slice(i, i + WRITE_BATCH_SIZE));
    }

    const gone = await tx
      .update(listings)
      .set({ available: false })
      .where(
        and(
          eq(listings.marketplace, marketplace),
          inArray(listings.productId, [...productIdByCardmarketId.values()]),
          eq(listings.available, true),
          lt(listings.lastSeenAt, now),
        ),
      )
      .returning({ id: listings.id });

    return { upserted, skipped, markedUnavailable: gone.length, skipReasons };
  });
}
