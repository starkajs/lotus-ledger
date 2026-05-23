ALTER TABLE "woocommerce_orders" ADD COLUMN IF NOT EXISTS "order_key" text;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "order_key" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "woocommerce_orders_order_key_idx" ON "woocommerce_orders" USING btree ("order_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_order_key_idx" ON "stripe_balance_transactions" USING btree ("order_key");
--> statement-breakpoint
UPDATE "woocommerce_orders"
SET "order_key" = trim("wc_raw"->>'order_key')
WHERE "order_key" IS NULL
  AND "wc_raw"->>'order_key' IS NOT NULL
  AND trim("wc_raw"->>'order_key') <> '';
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "order_key" = trim("stripe_raw"->'source'->'metadata'->>'order_key')
WHERE "order_key" IS NULL
  AND jsonb_typeof("stripe_raw"->'source') = 'object'
  AND ("stripe_raw"->'source'->>'object') = 'charge'
  AND trim("stripe_raw"->'source'->'metadata'->>'order_key') <> '';
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "order_key" = trim("stripe_raw"->'source'->'metadata'->>'order_key')
WHERE "order_key" IS NULL
  AND jsonb_typeof("stripe_raw"->'source') = 'object'
  AND ("stripe_raw"->'source'->>'object') = 'payment_intent'
  AND trim("stripe_raw"->'source'->'metadata'->>'order_key') <> '';
