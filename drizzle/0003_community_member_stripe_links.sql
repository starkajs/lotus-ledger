CREATE TABLE IF NOT EXISTS "community_member_stripe_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_member_id" uuid NOT NULL,
	"stripe_connection_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cm_stripe_links_customer_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "cm_stripe_links_member_conn_unique" UNIQUE("community_member_id","stripe_connection_id"),
	CONSTRAINT "cm_stripe_links_member_fk" FOREIGN KEY ("community_member_id") REFERENCES "public"."community_members"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cm_stripe_links_connection_fk" FOREIGN KEY ("stripe_connection_id") REFERENCES "public"."stripe_connections"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
INSERT INTO "community_member_stripe_links" ("community_member_id", "stripe_connection_id", "stripe_customer_id", "created_at", "updated_at")
SELECT "id", "stripe_connection_id", "stripe_customer_id", "created_at", "updated_at"
FROM "community_members"
WHERE "stripe_customer_id" IS NOT NULL
  AND "stripe_connection_id" IS NOT NULL
ON CONFLICT ("stripe_customer_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "community_members" DROP CONSTRAINT IF EXISTS "community_members_stripe_connection_id_stripe_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "community_members" DROP CONSTRAINT IF EXISTS "community_members_stripe_customer_id_unique";
--> statement-breakpoint
ALTER TABLE "community_members" DROP COLUMN IF EXISTS "stripe_customer_id";
--> statement-breakpoint
ALTER TABLE "community_members" DROP COLUMN IF EXISTS "stripe_connection_id";
