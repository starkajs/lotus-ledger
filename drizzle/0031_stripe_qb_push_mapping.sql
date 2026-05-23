ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "quickbooks_customer_id" text;
--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "quickbooks_deposit_account_id" text;
--> statement-breakpoint
ALTER TABLE "quickbooks_items" ADD COLUMN IF NOT EXISTS "quickbooks_class_ref" text;
--> statement-breakpoint
ALTER TABLE "stripe_quickbooks_push_rules" ALTER COLUMN "deposit_to_account_id" DROP NOT NULL;
