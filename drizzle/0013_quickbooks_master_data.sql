CREATE TABLE IF NOT EXISTS "quickbooks_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"name" text NOT NULL,
	"account_number" text,
	"account_type" text,
	"account_sub_type" text,
	"fully_qualified_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_accounts_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_accounts_realm_idx" ON "quickbooks_accounts" USING btree ("realm_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quickbooks_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"name" text NOT NULL,
	"fully_qualified_name" text,
	"parent_quickbooks_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_classes_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_classes_realm_idx" ON "quickbooks_classes" USING btree ("realm_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quickbooks_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"name" text NOT NULL,
	"item_type" text NOT NULL,
	"sku" text,
	"description" text,
	"unit_price" text,
	"income_account_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_items_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_items_realm_idx" ON "quickbooks_items" USING btree ("realm_id");
