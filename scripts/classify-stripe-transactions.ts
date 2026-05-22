/**
 * Re-run product classification on synced Stripe balance transactions.
 *
 * Usage:
 *   npm run classify:stripe-transactions
 *   npm run classify:stripe-transactions -- --force
 *   npm run classify:stripe-transactions -- --unmatched-only
 *   npm run classify:stripe-transactions -- --connection <uuid>
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { classifyAllStripeTransactions } from "../app/lib/product-classification.server";

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyUnmatched = args.includes("--unmatched-only");
const connectionFlag = args.indexOf("--connection");
const stripeConnectionId =
  connectionFlag >= 0 ? args[connectionFlag + 1] : undefined;

if (connectionFlag >= 0 && !stripeConnectionId) {
  console.error(
    "Usage: npm run classify:stripe-transactions -- [--force] [--unmatched-only] [--connection <uuid>]",
  );
  process.exit(1);
}

try {
  console.log("Classifying Stripe balance transactions…");
  if (force) console.log("  Mode: force (includes manual assignments)");
  if (onlyUnmatched) console.log("  Scope: unmatched / ambiguous only");
  if (stripeConnectionId) {
    console.log(`  Connection: ${stripeConnectionId}`);
  }

  const result = await classifyAllStripeTransactions({
    force,
    onlyUnmatched,
    stripeConnectionId,
  });

  console.log("\nDone.");
  console.log(`  Processed:       ${result.processed}`);
  console.log(`  Matched:         ${result.matched}`);
  console.log(`  Unmatched:       ${result.unmatched}`);
  console.log(`  Ambiguous:       ${result.ambiguous}`);
  console.log(`  Skipped manual:  ${result.skippedManual}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
