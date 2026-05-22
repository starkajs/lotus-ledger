ALTER TABLE "woocommerce_orders" ADD COLUMN "product_id" uuid;

ALTER TABLE "woocommerce_orders" ADD CONSTRAINT "woocommerce_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "woocommerce_orders_product_id_idx" ON "woocommerce_orders" USING btree ("product_id");
