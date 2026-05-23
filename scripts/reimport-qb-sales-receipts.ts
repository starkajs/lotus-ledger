/**
 * One-off: remove QB sales receipts in Lotus Ledger with no Stripe link,
 * re-import from QuickBooks since a date, then link Stripe transactions.
 *
 * Usage:
 *   npm run reimport:qb-sales-receipts
 *   npm run reimport:qb-sales-receipts -- --confirm
 *   npm run reimport:qb-sales-receipts -- --confirm --since 2025-01-01
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import {
  countQuickBooksSalesReceiptsWithoutStripeLink,
  deleteQuickBooksSalesReceiptsWithoutStripeLink,
  syncQuickBooksSalesReceiptsSince,
} from "../app/lib/quickbooks-sales-receipts.server";
import { linkStripeTransactionsToQuickBooksSalesReceipts } from "../app/lib/stripe-quickbooks-receipt-link.server";

const DEFAULT_SINCE = "2025-01-01";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseSince(args: string[]): string {
  const idx = args.indexOf("--since");
  if (idx === -1) return DEFAULT_SINCE;
  const value = args[idx + 1]?.trim();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error("--since requires YYYY-MM-DD");
    process.exit(1);
  }
  return value;
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const since = parseSince(args);
const through = todayIso();

try {
  const orphanCount = await countQuickBooksSalesReceiptsWithoutStripeLink();
  console.log(
    `Sales receipts without a Stripe quickbooks_sales_receipt_id link: ${orphanCount}`,
  );
  console.log(`Re-import window: TxnDate / stripe_created_at >= ${since} through ${through}`);

  if (!confirm) {
    console.log(
      "\nDry run only. Re-run with --confirm to delete orphans, sync from QuickBooks, and link Stripe.",
    );
    process.exit(0);
  }

  if (orphanCount > 0) {
    console.log(`\nDeleting ${orphanCount} orphan receipt(s)…`);
    const deleted = await deleteQuickBooksSalesReceiptsWithoutStripeLink();
    console.log(`Removed ${deleted} row(s).`);
  } else {
    console.log("\nNo orphan receipts to delete.");
  }

  console.log(`\nSyncing sales receipts from QuickBooks (TxnDate >= ${since})…`);
  const sync = await syncQuickBooksSalesReceiptsSince(since);
  console.log(
    `Sync done: ${sync.created} created, ${sync.updated} updated, ${sync.total} from QB, ${sync.tombstoned} tombstoned.`,
  );

  console.log(`\nLinking Stripe transactions to synced receipts…`);
  const link = await linkStripeTransactionsToQuickBooksSalesReceipts({
    stripeSince: since,
    stripeTo: through,
    receiptSince: since,
    receiptTo: through,
  });
  console.log(
    `Link done: ${link.linked} linked, ${link.alreadyLinked} already linked, ` +
      `${link.noMatch} no match, ${link.skippedReceiptTaken} skipped (receipt taken), ` +
      `${link.stripeConsidered} Stripe row(s) considered.`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
