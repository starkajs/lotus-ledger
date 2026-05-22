CREATE TABLE IF NOT EXISTS "woocommerce_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wc_product_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"sku" text,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"catalog_visibility" text,
	"permalink" text,
	"short_description" text,
	"description" text,
	"currency" text NOT NULL,
	"price_minor" integer,
	"regular_price_minor" integer,
	"sale_price_minor" integer,
	"on_sale" boolean DEFAULT false NOT NULL,
	"stock_status" text,
	"stock_quantity" integer,
	"category_summary" text,
	"wc_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woocommerce_products_wc_product_id_unique" UNIQUE("wc_product_id")
);

CREATE INDEX IF NOT EXISTS "woocommerce_products_sku_idx" ON "woocommerce_products" USING btree ("sku");

CREATE INDEX IF NOT EXISTS "woocommerce_products_status_idx" ON "woocommerce_products" USING btree ("status");

CREATE INDEX IF NOT EXISTS "woocommerce_products_name_idx" ON "woocommerce_products" USING btree ("name");
