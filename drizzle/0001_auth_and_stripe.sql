ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invited_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DELETE FROM "stripe_connections";
--> statement-breakpoint
ALTER TABLE "stripe_connections" DROP CONSTRAINT IF EXISTS "stripe_connections_stripe_account_id_unique";--> statement-breakpoint
ALTER TABLE "stripe_connections" ALTER COLUMN "stripe_account_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_connections" RENAME COLUMN "display_name" TO "label";
EXCEPTION
 WHEN undefined_column THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
UPDATE "stripe_connections" SET "label" = 'Stripe account' WHERE "label" IS NULL;--> statement-breakpoint
ALTER TABLE "stripe_connections" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "key_last4" text;--> statement-breakpoint
UPDATE "stripe_connections" SET "key_last4" = '0000' WHERE "key_last4" IS NULL;--> statement-breakpoint
ALTER TABLE "stripe_connections" ALTER COLUMN "key_last4" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "default_currency" text;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN IF NOT EXISTS "added_by_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
