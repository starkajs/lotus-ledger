ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD COLUMN IF NOT EXISTS "community_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "stripe_balance_transactions" ADD CONSTRAINT "stripe_txn_member_fk" FOREIGN KEY ("community_member_id") REFERENCES "public"."community_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_customer_idx" ON "stripe_balance_transactions" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_txn_member_idx" ON "stripe_balance_transactions" USING btree ("community_member_id");
