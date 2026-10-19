import { and, eq, inArray, lt } from 'drizzle-orm';
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
    let upserted = 0;
    for (const l of result.listings) {
      const productId = productIdByCardmarketId.get(l.cardmarketProductId);
      if (productId === undefined) {
        skip('Untracked product');
        continue;
      }
      const values = {
        productId,
        title: l.title,
        url: l.url,
        priceCents: l.priceCents,
        currency: l.currency,
        shippingCents: l.shippingCents,
        condition: l.condition,
        language: l.language,
        isReverseHolo: l.isReverseHolo,
        sellerName: l.sellerName,
        sellerCountry: l.sellerCountry,
        imageUrl: l.imageUrl,
        available: true,
        lastSeenAt: now,
      };
      const [row] = await tx
        .insert(listings)
        .values({ marketplace, externalId: l.externalId, firstSeenAt: now, ...values })
        .onConflictDoUpdate({ target: [listings.marketplace, listings.externalId], set: values })
        .returning({ id: listings.id });
      upserted += 1;

      const prev = existing.get(l.externalId);
      if (!prev || prev.priceCents !== l.priceCents || prev.shippingCents !== l.shippingCents) {
        await tx.insert(listingPriceHistory).values({
          listingId: row.id,
          priceCents: l.priceCents,
          shippingCents: l.shippingCents,
          observedAt: now,
        });
      }
      existing.set(l.externalId, { id: row.id, externalId: l.externalId, priceCents: l.priceCents, shippingCents: l.shippingCents });
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
