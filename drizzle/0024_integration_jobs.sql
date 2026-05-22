CREATE TABLE "integration_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_type" text NOT NULL,
  "status" text NOT NULL,
  "triggered_by" text NOT NULL,
  "user_id" uuid,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "duration_ms" integer,
  "options" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "integration_job_runs" ADD CONSTRAINT "integration_job_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "integration_job_runs_job_type_idx" ON "integration_job_runs" USING btree ("job_type");
CREATE INDEX IF NOT EXISTS "integration_job_runs_started_at_idx" ON "integration_job_runs" USING btree ("started_at" DESC);
CREATE INDEX IF NOT EXISTS "integration_job_runs_status_idx" ON "integration_job_runs" USING btree ("status");

CREATE TABLE "classification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_balance_transaction_id" uuid NOT NULL,
  "job_run_id" uuid,
  "triggered_by" text NOT NULL,
  "action" text NOT NULL,
  "user_id" uuid,
  "previous_product_id" uuid,
  "new_product_id" uuid,
  "previous_match_rule_id" uuid,
  "new_match_rule_id" uuid,
  "previous_status" text,
  "new_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "classification_events" ADD CONSTRAINT "classification_events_stripe_balance_transaction_id_stripe_balance_transactions_id_fk" FOREIGN KEY ("stripe_balance_transaction_id") REFERENCES "public"."stripe_balance_transactions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "classification_events" ADD CONSTRAINT "classification_events_job_run_id_integration_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."integration_job_runs"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "classification_events" ADD CONSTRAINT "classification_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "classification_events_txn_idx" ON "classification_events" USING btree ("stripe_balance_transaction_id");
CREATE INDEX IF NOT EXISTS "classification_events_created_at_idx" ON "classification_events" USING btree ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "classification_events_job_run_id_idx" ON "classification_events" USING btree ("job_run_id");
