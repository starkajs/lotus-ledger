ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "quickbooks_sales_receipt_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_qb_sales_receipt_id_idx" ON "stripe_balance_transactions" USING btree ("quickbooks_sales_receipt_id");
