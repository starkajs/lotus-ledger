ALTER TABLE "community_members" ADD COLUMN IF NOT EXISTS "country_code" text;
--> statement-breakpoint
UPDATE "community_members"
SET "country_code" = upper(trim("country"))
WHERE "country" IS NOT NULL
  AND length(trim("country")) = 2;
--> statement-breakpoint
ALTER TABLE "community_members" DROP COLUMN IF EXISTS "country";
