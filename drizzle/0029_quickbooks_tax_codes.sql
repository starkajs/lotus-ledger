CREATE TABLE IF NOT EXISTS "quickbooks_tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"taxable" boolean,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_tax_codes_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_tax_codes_realm_idx" ON "quickbooks_tax_codes" USING btree ("realm_id");
--> statement-breakpoint
ALTER TABLE "quickbooks_items" ADD COLUMN IF NOT EXISTS "sales_tax_code_ref" text;
--> statement-breakpoint
ALTER TABLE "stripe_quickbooks_push_rules" ADD COLUMN IF NOT EXISTS "tax_code_id" text;
