ALTER TABLE "listings" ADD COLUMN "edition" text DEFAULT 'unlimited' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "rarity" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rarity" text;--> statement-breakpoint
CREATE INDEX "listings_product_id_idx" ON "listings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "listings_available_language_idx" ON "listings" USING btree ("available","language");