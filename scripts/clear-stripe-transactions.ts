/**
 * Delete all rows from stripe_balance_transactions.
 *
 * Usage:
 *   npm run clear:stripe-transactions -- --confirm
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import {
  countStripeBalanceTransactions,
  deleteAllStripeBalanceTransactions,
} from "../app/lib/stripe-balance-transactions.server";

const args = process.argv.slice(2);

if (!args.includes("--confirm")) {
  console.error(
    "This permanently deletes all synced Stripe transactions.\n" +
      "Re-run with --confirm:\n" +
      "  npm run clear:stripe-transactions -- --confirm",
  );
  process.exit(1);
}

try {
  const before = await countStripeBalanceTransactions();
  console.log(`Deleting ${before} stripe_balance_transactions row(s)…`);

  const deleted = await deleteAllStripeBalanceTransactions();

  console.log(`Done. Removed ${deleted} row(s).`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
