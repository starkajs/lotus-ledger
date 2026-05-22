CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"quickbooks_item_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_match_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"field" text NOT NULL,
	"match_type" text NOT NULL,
	"pattern" text NOT NULL,
	"case_insensitive" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_match_rules" ADD CONSTRAINT "product_match_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "product_id" uuid;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "product_match_rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "product_match_status" text;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "product_matched_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD CONSTRAINT "stripe_txn_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD CONSTRAINT "stripe_txn_product_rule_fk" FOREIGN KEY ("product_match_rule_id") REFERENCES "public"."product_match_rules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_product_idx" ON "stripe_balance_transactions" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_product_status_idx" ON "stripe_balance_transactions" USING btree ("product_match_status");
--> statement-breakpoint
INSERT INTO "products" ("code", "name", "sort_order")
VALUES
  ('BP', 'Basic Programme', 10),
  ('DB', 'Discovering Buddhism', 20),
  ('DONORBOX', 'Donorbox', 30),
  ('OTHER', 'Other', 99)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_match_rules" ("product_id", "priority", "field", "match_type", "pattern", "case_insensitive")
SELECT p.id, 10, 'sku', 'regex', '\[BP[-A-Z0-9]*\]', true
FROM "products" p
WHERE p.code = 'BP'
  AND NOT EXISTS (SELECT 1 FROM "product_match_rules" r WHERE r.pattern = '\[BP[-A-Z0-9]*\]');
--> statement-breakpoint
INSERT INTO "product_match_rules" ("product_id", "priority", "field", "match_type", "pattern", "case_insensitive")
SELECT p.id, 20, 'any', 'contains', 'basic programme', true
FROM "products" p
WHERE p.code = 'BP'
  AND NOT EXISTS (SELECT 1 FROM "product_match_rules" r WHERE r.pattern = 'basic programme' AND r.field = 'any');
--> statement-breakpoint
INSERT INTO "product_match_rules" ("product_id", "priority", "field", "match_type", "pattern", "case_insensitive")
SELECT p.id, 21, 'any', 'contains', 'discovering buddhism', true
FROM "products" p
WHERE p.code = 'DB'
  AND NOT EXISTS (SELECT 1 FROM "product_match_rules" r WHERE r.pattern = 'discovering buddhism');
--> statement-breakpoint
INSERT INTO "product_match_rules" ("product_id", "priority", "field", "match_type", "pattern", "case_insensitive")
SELECT p.id, 30, 'line_items_summary', 'contains', 'donorbox', true
FROM "products" p
WHERE p.code = 'DONORBOX'
  AND NOT EXISTS (SELECT 1 FROM "product_match_rules" r WHERE r.pattern = 'donorbox' AND r.field = 'line_items_summary');
