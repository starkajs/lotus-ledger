CREATE TABLE IF NOT EXISTS "quickbooks_sales_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"quickbooks_id" text NOT NULL,
	"doc_number" text,
	"txn_date" date,
	"customer_quickbooks_id" text,
	"customer_name" text,
	"total_amt" text NOT NULL,
	"currency_code" text,
	"payment_method" text,
	"deposit_to_account_ref" text,
	"private_note" text,
	"line_summary" text,
	"quickbooks_raw" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qb_sales_receipts_realm_qb_id_unique" UNIQUE("realm_id","quickbooks_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sales_receipts_realm_idx" ON "quickbooks_sales_receipts" USING btree ("realm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sales_receipts_txn_date_idx" ON "quickbooks_sales_receipts" USING btree ("realm_id", "txn_date" DESC);
