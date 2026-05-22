ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "customer_memo" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "bill_email" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "ship_addr_summary" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "class_ref_id" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "class_ref_name" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "department_ref_id" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "department_ref_name" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "total_tax" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "sync_token" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "qb_created_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "qb_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quickbooks_sales_receipts" ADD COLUMN IF NOT EXISTS "line_count" integer;
