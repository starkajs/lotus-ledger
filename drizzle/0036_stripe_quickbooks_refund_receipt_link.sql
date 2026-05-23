ALTER TABLE "stripe_balance_transactions" ADD COLUMN "quickbooks_refund_receipt_id" text;
--> statement-breakpoint
CREATE INDEX "stripe_balance_transactions_qb_refund_receipt_id_idx" ON "stripe_balance_transactions" USING btree ("quickbooks_refund_receipt_id");
