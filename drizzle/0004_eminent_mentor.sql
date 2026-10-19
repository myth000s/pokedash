CREATE TABLE "us_reference_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"captured_day" date NOT NULL,
	"usd_cents" integer NOT NULL,
	CONSTRAINT "us_reference_prices_product_day_uq" UNIQUE("product_id","captured_day")
);
--> statement-breakpoint
ALTER TABLE "us_reference_prices" ADD CONSTRAINT "us_reference_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;