ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text;
--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "stripe_connections" DROP CONSTRAINT IF EXISTS "stripe_connections_added_by_user_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
