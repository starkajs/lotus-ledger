ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "stripe_raw" jsonb;
