CREATE TABLE IF NOT EXISTS "quickbooks_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"active" boolean DEFAULT true NOT NULL,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_payment_methods_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_payment_methods_realm_idx" ON "quickbooks_payment_methods" USING btree ("realm_id");
--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "quickbooks_payment_method_id" text;
--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "quickbooks_payment_ref_template" text;
--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "quickbooks_customer_memo_template" text;
