ALTER TABLE "community_member_stripe_links" DROP CONSTRAINT IF EXISTS "cm_stripe_links_member_conn_unique";
--> statement-breakpoint
ALTER TABLE "community_member_stripe_links" DROP CONSTRAINT IF EXISTS "community_member_stripe_links_member_connection_unique";
