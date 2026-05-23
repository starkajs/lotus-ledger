CREATE TABLE IF NOT EXISTS "stripe_quickbooks_push_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"field" text NOT NULL,
	"match_type" text NOT NULL,
	"pattern" text NOT NULL,
	"case_insensitive" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deposit_to_account_id" text NOT NULL,
	"quickbooks_class_id" text,
	"payment_method_id" text,
	"amount_source" text DEFAULT 'net' NOT NULL,
	"customer_mode" text DEFAULT 'omit' NOT NULL,
	"customer_quickbooks_id" text,
	"line_description" text,
	"private_note_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
