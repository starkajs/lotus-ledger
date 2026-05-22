ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text;

CREATE INDEX IF NOT EXISTS "stripe_txn_payment_intent_idx" ON "stripe_balance_transactions" USING btree ("stripe_payment_intent_id");
