/**
 * One-off import of Stripe customers into community_members.
 *
 * Usage:
 *   npm run sync:community
 *   npm run sync:community -- --connection <stripe-connection-uuid>
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { syncCommunityMembersFromStripe } from "../app/lib/sync-community-from-stripe.server";

const args = process.argv.slice(2);
const connectionFlag = args.indexOf("--connection");
const connectionId =
  connectionFlag >= 0 ? args[connectionFlag + 1] : undefined;

if (connectionFlag >= 0 && !connectionId) {
  console.error("Usage: npm run sync:community -- [--connection <uuid>]");
  process.exit(1);
}

try {
  console.log("Syncing Stripe customers into community_members…");
  if (connectionId) {
    console.log(`Stripe connection: ${connectionId}`);
  } else {
    console.log("Stripe connections: all saved accounts");
  }

  const result = await syncCommunityMembersFromStripe({ connectionId });

  console.log("\nDone.");
  console.log(`  Connections processed: ${result.connectionsProcessed}`);
  console.log(`  Members created:       ${result.membersCreated}`);
  console.log(`  Stripe links created:  ${result.linksCreated}`);
  console.log(`  Stripe links updated:  ${result.linksUpdated}`);
  console.log(`  Skipped (no email):    ${result.skippedNoEmail}`);
  console.log(`  Conflicts:             ${result.conflicts.length}`);

  if (result.conflicts.length > 0) {
    console.log("\nConflicts (not imported):");
    for (const c of result.conflicts.slice(0, 20)) {
      console.log(
        `  - ${c.stripeCustomerId} ${c.email ?? "(no email)"}: ${c.reason}`,
      );
    }
    if (result.conflicts.length > 20) {
      console.log(`  … and ${result.conflicts.length - 20} more`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
