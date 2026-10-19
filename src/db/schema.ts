import { boolean, date, doublePrecision, integer, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  cardmarketId: integer('cardmarket_id').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  categoryName: text('category_name').notNull(),
  cardmarketExpansionId: integer('cardmarket_expansion_id').notNull(),
  setKey: text('set_key').notNull(),
  imageUrl: text('image_url'),
  tcgplayerId: integer('tcgplayer_id'),
  updatedAt: ts('updated_at').notNull(),
});

export const benchmarkSnapshots = pgTable(
  'benchmark_snapshots',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id').notNull().references(() => products.id),
    source: text('source').notNull().default('cardmarket_price_guide'),
    capturedAt: ts('captured_at').notNull(),
    avgCents: integer('avg_cents'),
    lowCents: integer('low_cents'),
    trendCents: integer('trend_cents'),
    avg1Cents: integer('avg1_cents'),
    avg7Cents: integer('avg7_cents'),
    avg30Cents: integer('avg30_cents'),
    avgHoloCents: integer('avg_holo_cents'),
    lowHoloCents: integer('low_holo_cents'),
    trendHoloCents: integer('trend_holo_cents'),
    avg1HoloCents: integer('avg1_holo_cents'),
    avg7HoloCents: integer('avg7_holo_cents'),
    avg30HoloCents: integer('avg30_holo_cents'),
  },
  (t) => [unique('benchmark_snapshots_product_captured_uq').on(t.productId, t.capturedAt)],
);

export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    marketplace: text('marketplace').notNull(),
    externalId: text('external_id').notNull(),
    productId: integer('product_id').notNull().references(() => products.id),
    title: text('title').notNull(),
    url: text('url').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull(),
    shippingCents: integer('shipping_cents'),
    condition: text('condition'),
    language: text('language'),
    isReverseHolo: boolean('is_reverse_holo').notNull().default(false),
    sellerName: text('seller_name'),
    sellerCountry: text('seller_country'),
    imageUrl: text('image_url'),
    available: boolean('available').notNull().default(true),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
  },
  (t) => [unique('listings_marketplace_external_uq').on(t.marketplace, t.externalId)],
);

export const listingPriceHistory = pgTable('listing_price_history', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').notNull().references(() => listings.id),
  priceCents: integer('price_cents').notNull(),
  shippingCents: integer('shipping_cents'),
  observedAt: ts('observed_at').notNull(),
});

export const fxRates = pgTable('fx_rates', {
  rateDate: date('rate_date', { mode: 'string' }).primaryKey(),
  usdPerEur: doublePrecision('usd_per_eur').notNull(),
});

export const usReferencePrices = pgTable(
  'us_reference_prices',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id').notNull().references(() => products.id),
    capturedAt: ts('captured_at').notNull(),
    capturedDay: date('captured_day', { mode: 'string' }).notNull(),
    usdCents: integer('usd_cents'), // null: asked that day, no price
  },
  (t) => [unique('us_reference_prices_product_day_uq').on(t.productId, t.capturedDay)],
);
