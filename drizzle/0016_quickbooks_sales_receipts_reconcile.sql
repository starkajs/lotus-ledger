ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "tracking_num" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "currency_name" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "line_items" jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sales_receipts_tracking_idx" ON "quickbooks_sales_receipts" USING btree ("realm_id", "tracking_num");
