/**
 * Debug a Stripe payment intent vs Lotus Ledger sync.
 * Usage: npx tsx scripts/debug-stripe-pi.ts pi_xxx
 */
import "dotenv/config";
import { closeDb, getDb } from "../app/db/index";
import { stripeBalanceTransactions } from "../app/db/schema";
import {
  getStripeClientForConnection,
  listStripeConnections,
} from "../app/lib/stripe-connections.server";
import { isPostedStripeBalanceTransaction } from "../app/lib/stripe-balance-transactions.server";
import { extractPaymentIntentIdFromStripeRaw } from "../app/lib/stripe-transaction-signals";
import { sql } from "drizzle-orm";

const pi = process.argv[2]?.trim();
if (!pi) {
  console.error("Usage: npx tsx scripts/debug-stripe-pi.ts pi_...");
  process.exit(1);
}

const db = getDb();
const dbRows = await db
  .select({
    id: stripeBalanceTransactions.id,
    txn: stripeBalanceTransactions.stripeBalanceTransactionId,
    paymentIntentId: stripeBalanceTransactions.stripePaymentIntentId,
    status: stripeBalanceTransactions.status,
    type: stripeBalanceTransactions.type,
    created: stripeBalanceTransactions.stripeCreatedAt,
  })
  .from(stripeBalanceTransactions)
  .where(sql`stripe_payment_intent_id = ${pi} OR stripe_raw::text LIKE ${"%" + pi + "%"}`);

console.log("=== Lotus Ledger DB ===");
console.log(dbRows.length ? dbRows : "(no rows)");

const connections = await listStripeConnections();
console.log("\n=== Stripe API (each connection) ===");

for (const conn of connections) {
  console.log(`\n--- ${conn.label} (${conn.id}) ---`);
  const stripe = await getStripeClientForConnection(conn.id);

  try {
    const intent = await stripe.paymentIntents.retrieve(pi, {
      expand: ["latest_charge"],
    });
    console.log("PaymentIntent:", {
      id: intent.id,
      status: intent.status,
      created: new Date(intent.created * 1000).toISOString(),
      amount: intent.amount,
      currency: intent.currency,
    });
    const chargeId =
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : intent.latest_charge?.id;
    console.log("Latest charge:", chargeId ?? "—");

    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      const balanceTxnId =
        typeof charge.balance_transaction === "string"
          ? charge.balance_transaction
          : charge.balance_transaction?.id;
      console.log("Charge balance_transaction:", balanceTxnId ?? "—");

      if (balanceTxnId) {
        const tx = await stripe.balanceTransactions.retrieve(balanceTxnId, {
          expand: ["source"],
        });
        const posted = isPostedStripeBalanceTransaction(tx);
        console.log("Balance transaction:", {
          id: tx.id,
          status: tx.status,
          type: tx.type,
          created: new Date(tx.created * 1000).toISOString(),
          net: tx.net,
          wouldImport: posted,
          extractedPi: extractPaymentIntentIdFromStripeRaw(
            JSON.parse(JSON.stringify(tx)) as Record<string, unknown>,
          ),
        });
        if (!posted) {
          console.log(
            ">>> SKIPPED by sync: charge/payment did not succeed or balance txn status is not available/pending",
          );
        }
      }
    }
  } catch (err) {
    console.log(
      "Not found on this account:",
      err instanceof Error ? err.message : err,
    );
  }
}

await closeDb();
