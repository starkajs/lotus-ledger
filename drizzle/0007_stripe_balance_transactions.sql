CREATE TABLE IF NOT EXISTS "stripe_balance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_connection_id" uuid NOT NULL,
	"stripe_balance_transaction_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"net" integer NOT NULL,
	"fee" integer NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"description" text,
	"source_id" text,
	"reporting_category" text,
	"available_on" timestamp with time zone,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"pushed_to_quickbooks" boolean DEFAULT false NOT NULL,
	"quickbooks_pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_txn_connection_fk" FOREIGN KEY ("stripe_connection_id") REFERENCES "public"."stripe_connections"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "stripe_txn_conn_txn_unique" UNIQUE("stripe_connection_id","stripe_balance_transaction_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_connection_idx" ON "stripe_balance_transactions" USING btree ("stripe_connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_created_idx" ON "stripe_balance_transactions" USING btree ("stripe_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_qb_pushed_idx" ON "stripe_balance_transactions" USING btree ("pushed_to_quickbooks");
