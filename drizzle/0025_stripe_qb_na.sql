ALTER TABLE "stripe_balance_transactions" ALTER COLUMN "pushed_to_quickbooks" DROP NOT NULL;
--> statement-breakpoint
UPDATE "stripe_balance_transactions"
SET "pushed_to_quickbooks" = NULL
WHERE ("stripe_created_at" AT TIME ZONE 'Europe/London')::date < '2026-04-01'::date;
