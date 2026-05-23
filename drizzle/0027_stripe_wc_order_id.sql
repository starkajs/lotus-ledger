ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "wc_order_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_wc_order_id_idx" ON "stripe_balance_transactions" USING btree ("wc_order_id");
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "wc_order_id" = ("stripe_raw"->'source'->'metadata'->>'order_id')::int
WHERE "wc_order_id" IS NULL
  AND jsonb_typeof("stripe_raw"->'source') = 'object'
  AND ("stripe_raw"->'source'->>'object') = 'charge'
  AND ("stripe_raw"->'source'->'metadata'->>'order_id') ~ '^\d+$';
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "wc_order_id" = ("stripe_raw"->'source'->'metadata'->>'order_id')::int
WHERE "wc_order_id" IS NULL
  AND jsonb_typeof("stripe_raw"->'source') = 'object'
  AND ("stripe_raw"->'source'->>'object') = 'payment_intent'
  AND ("stripe_raw"->'source'->'metadata'->>'order_id') ~ '^\d+$';
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "wc_order_id" = ("stripe_raw"->'source'->'latest_charge'->'metadata'->>'order_id')::int
WHERE "wc_order_id" IS NULL
  AND jsonb_typeof("stripe_raw"->'source') = 'object'
  AND ("stripe_raw"->'source'->>'object') = 'payment_intent'
  AND jsonb_typeof("stripe_raw"->'source'->'latest_charge') = 'object'
  AND ("stripe_raw"->'source'->'latest_charge'->'metadata'->>'order_id') ~ '^\d+$';
