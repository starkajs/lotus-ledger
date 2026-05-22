ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "qb_status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "deleted_in_qb_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "quickbooks_sales_receipts"
SET "qb_status" = 'active', "last_seen_at" = "synced_at"
WHERE "last_seen_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sales_receipts_status_idx" ON "quickbooks_sales_receipts" USING btree ("realm_id", "qb_status");
