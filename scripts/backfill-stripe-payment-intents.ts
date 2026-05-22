/**
 * Populate stripe_payment_intent_id from stored stripe_raw JSON.
 *
 * Usage:
 *   npm run backfill:stripe-payment-intents
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { backfillStripePaymentIntentIds } from "../app/lib/stripe-balance-transactions.server";

try {
  const result = await backfillStripePaymentIntentIds();
  console.log(
    `Done. Scanned ${result.scanned} row(s) with no payment intent id; updated ${result.updated}.`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
