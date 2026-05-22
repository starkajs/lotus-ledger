CREATE TABLE IF NOT EXISTS "woocommerce_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wc_order_id" integer NOT NULL,
	"order_number" text,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"total_minor" integer NOT NULL,
	"subtotal_minor" integer,
	"total_tax_minor" integer,
	"shipping_minor" integer,
	"discount_minor" integer,
	"date_created" timestamp with time zone NOT NULL,
	"date_modified" timestamp with time zone,
	"date_paid" timestamp with time zone,
	"date_completed" timestamp with time zone,
	"payment_method" text,
	"payment_method_title" text,
	"transaction_id" text,
	"wc_customer_id" integer,
	"billing_email" text,
	"billing_first_name" text,
	"billing_last_name" text,
	"billing_country" text,
	"billing_city" text,
	"billing_postcode" text,
	"customer_note" text,
	"line_items" jsonb,
	"line_summary" text,
	"wc_raw" jsonb,
	"community_member_id" uuid,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woocommerce_orders_wc_order_id_unique" UNIQUE("wc_order_id")
);

ALTER TABLE "woocommerce_orders" ADD CONSTRAINT "woocommerce_orders_member_fk" FOREIGN KEY ("community_member_id") REFERENCES "public"."community_members"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "woocommerce_orders_date_created_idx" ON "woocommerce_orders" USING btree ("date_created" DESC);

CREATE INDEX IF NOT EXISTS "woocommerce_orders_status_idx" ON "woocommerce_orders" USING btree ("status");

CREATE INDEX IF NOT EXISTS "woocommerce_orders_member_idx" ON "woocommerce_orders" USING btree ("community_member_id");

CREATE INDEX IF NOT EXISTS "woocommerce_orders_billing_email_idx" ON "woocommerce_orders" USING btree ("billing_email");
