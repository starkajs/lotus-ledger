/**
 * Delete all rows from quickbooks_sales_receipts.
 *
 * Usage:
 *   npm run clear:qb-sales-receipts -- --confirm
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import {
  countQuickBooksSalesReceipts,
  deleteAllQuickBooksSalesReceipts,
} from "../app/lib/quickbooks-sales-receipts.server";

const args = process.argv.slice(2);

if (!args.includes("--confirm")) {
  console.error(
    "This permanently deletes all synced QuickBooks sales receipts.\n" +
      "Re-run with --confirm:\n" +
      "  npm run clear:qb-sales-receipts -- --confirm",
  );
  process.exit(1);
}

try {
  const before = await countQuickBooksSalesReceipts();
  console.log(`Deleting ${before} quickbooks_sales_receipts row(s)…`);

  const deleted = await deleteAllQuickBooksSalesReceipts();

  console.log(`Done. Removed ${deleted} row(s).`);
  console.log(
    "Refresh from QuickBooks on the Sales receipts page to re-import (one row per QuickBooks Id).",
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
