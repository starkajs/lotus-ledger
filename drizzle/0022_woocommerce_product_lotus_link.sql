ALTER TABLE "woocommerce_products" ADD COLUMN "product_id" uuid;

ALTER TABLE "woocommerce_products" ADD CONSTRAINT "woocommerce_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "woocommerce_products_product_id_idx" ON "woocommerce_products" USING btree ("product_id");
