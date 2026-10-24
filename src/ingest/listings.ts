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
// 3 parameters per row, well under Postgres' 65,535-parameter limit.
const HISTORY_BATCH_SIZE = 5000;

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
  edition: sql`excluded.edition`,
  rarity: sql`excluded.rarity`,
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
  const skipReasons: Record<string, number> = {};
  let skipped = 0;
  const skip = (reason: string) => {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };
  for (const s of result.skipped) skip(s.reason);

  // Product pictures, TCGplayer ids and rarities travel together, one row per product.
  // Pictures and TCGplayer ids come from the provider's product list (null clears them; the last entry wins).
  // A product's rarity is the first non-null one among its listings in this run (null keeps the stored one).
  const productUpdates = new Map<number, { meta: { imageUrl: string | null; tcgplayerId: number | null } | null; rarity: string | null }>();
  for (const m of result.products) {
    const productId = productIdByCardmarketId.get(m.cardmarketProductId);
    if (productId === undefined) continue;
    productUpdates.set(productId, { meta: { imageUrl: m.imageUrl, tcgplayerId: m.tcgplayerId }, rarity: null });
  }
  for (const l of result.listings) {
    const productId = productIdByCardmarketId.get(l.cardmarketProductId);
    if (productId === undefined || !l.rarity) continue;
    const u = productUpdates.get(productId);
    if (!u) productUpdates.set(productId, { meta: null, rarity: l.rarity });
    else if (u.rarity === null) u.rarity = l.rarity;
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
      edition: l.edition,
      rarity: l.rarity,
      sellerCountry: l.sellerCountry,
      imageUrl: l.imageUrl,
      available: true,
      lastSeenAt: now,
    });
    upserted += 1;
  }
  const rows = [...rowsByExternalId.values()];
  const at = sql`${sql.param(now, listings.lastSeenAt)}::timestamptz`;

  // Each statement is a round trip to the hosted database, so write in batches, and keep the
  // price history inside the database: nothing is read back.
  return db.transaction(async (tx) => {
    const updates = [...productUpdates];
    for (let i = 0; i < updates.length; i += WRITE_BATCH_SIZE) {
      const values = updates.slice(i, i + WRITE_BATCH_SIZE).map(([id, u]) =>
        sql`(${id}::int, ${u.meta !== null}::boolean, ${u.meta?.imageUrl ?? null}::text, ${u.meta?.tcgplayerId ?? null}::int, ${u.rarity}::text)`);
      await tx.execute(sql`update ${products} set
        image_url = case when v.has_meta then v.image_url else products.image_url end,
        tcgplayer_id = case when v.has_meta then v.tcgplayer_id else products.tcgplayer_id end,
        rarity = coalesce(v.rarity, products.rarity)
        from (values ${sql.join(values, sql`, `)}) as v(id, has_meta, image_url, tcgplayer_id, rarity)
        where products.id = v.id`);
    }

    // History for known listings whose price or shipping changed, read against the stored row before the upsert.
    for (let i = 0; i < rows.length; i += HISTORY_BATCH_SIZE) {
      const values = rows.slice(i, i + HISTORY_BATCH_SIZE).map((r) =>
        sql`(${r.externalId}::text, ${r.priceCents}::int, ${r.shippingCents ?? null}::int)`);
      await tx.execute(sql`insert into ${listingPriceHistory} (listing_id, price_cents, shipping_cents, observed_at)
        select l.id, v.price_cents, v.shipping_cents, ${at}
        from (values ${sql.join(values, sql`, `)}) as v(external_id, price_cents, shipping_cents)
        join ${listings} l on l.marketplace = ${marketplace} and l.external_id = v.external_id
        where l.price_cents <> v.price_cents or l.shipping_cents is distinct from v.shipping_cents`);
    }

    for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
      await tx
        .insert(listings)
        .values(rows.slice(i, i + WRITE_BATCH_SIZE))
        .onConflictDoUpdate({ target: [listings.marketplace, listings.externalId], set: UPSERT_SET });
    }

    // The first price of every listing this run added (first_seen_at is kept on conflict, so only new rows match).
    if (rows.length > 0) {
      await tx.execute(sql`insert into ${listingPriceHistory} (listing_id, price_cents, shipping_cents, observed_at)
        select l.id, l.price_cents, l.shipping_cents, ${at}
        from ${listings} l join ${products} p on p.id = l.product_id
        where p.set_key = ${set.key} and l.marketplace = ${marketplace} and l.first_seen_at = ${at}`);
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
