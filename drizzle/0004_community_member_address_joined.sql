ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "address_line1" text;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "address_line2" text;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "city" text;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "state" text;
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "postal_code" text;
--> statement-breakpoint
ALTER TABLE "community_member_stripe_links" ADD COLUMN IF NOT EXISTS "stripe_customer_created_at" timestamp with time zone;
