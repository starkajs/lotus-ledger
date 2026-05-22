CREATE TABLE IF NOT EXISTS "community_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"name" text,
	"stripe_connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_email_unique" UNIQUE("email"),
	CONSTRAINT "community_members_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "community_members_connection_fk" FOREIGN KEY ("stripe_connection_id") REFERENCES "public"."stripe_connections"("id") ON DELETE set null ON UPDATE no action
);
