/**
 * Link guest/Donorbox Stripe transactions to community members from stripe_raw.
 *
 * Usage:
 *   npm run backfill:stripe-community-links
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { backfillStripeTransactionCommunityLinks } from "../app/lib/stripe-balance-transactions.server";

try {
  const result = await backfillStripeTransactionCommunityLinks();
  console.log("Done.");
  console.log(`  Scanned (unlinked guest txns): ${result.scanned}`);
  console.log(`  Linked to community:         ${result.linked}`);
  console.log(`  Donorbox member enrichments: ${result.enriched}`);
  console.log(`  Skipped (no email in raw):   ${result.skippedNoEmail}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
