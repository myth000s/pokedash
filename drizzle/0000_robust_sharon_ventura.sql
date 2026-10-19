CREATE TABLE "benchmark_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"source" text DEFAULT 'cardmarket_price_guide' NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"avg_cents" integer,
	"low_cents" integer,
	"trend_cents" integer,
	"avg1_cents" integer,
	"avg7_cents" integer,
	"avg30_cents" integer,
	"avg_holo_cents" integer,
	"low_holo_cents" integer,
	"trend_holo_cents" integer,
	"avg1_holo_cents" integer,
	"avg7_holo_cents" integer,
	"avg30_holo_cents" integer,
	CONSTRAINT "benchmark_snapshots_product_captured_uq" UNIQUE("product_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "listing_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"shipping_cents" integer,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"external_id" text NOT NULL,
	"product_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"shipping_cents" integer,
	"condition" text,
	"language" text,
	"is_reverse_holo" boolean DEFAULT false NOT NULL,
	"seller_name" text,
	"seller_country" text,
	"available" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listings_marketplace_external_uq" UNIQUE("marketplace","external_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"cardmarket_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category_name" text NOT NULL,
	"cardmarket_expansion_id" integer NOT NULL,
	"set_key" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "products_cardmarket_id_unique" UNIQUE("cardmarket_id")
);
--> statement-breakpoint
ALTER TABLE "benchmark_snapshots" ADD CONSTRAINT "benchmark_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;