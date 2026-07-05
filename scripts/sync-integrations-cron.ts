/**
 * Sequential integration sync for cron: WooCommerce → Stripe → QuickBooks.
 *
 * Usage:
 *   npm run sync:integrations-cron
 *
 * Optional env:
 *   CRON_WOO_SYNC_DAYS / WOO_SYNC_DAYS  (default: 30)
 *   CRON_STRIPE_SYNC_DAYS / STRIPE_SYNC_DAYS  (default: 30)
 *   CRON_QB_PUSH_DAYS  (default: same as Stripe sync window)
 *   CRON_REPORT_TO  (default: andrew@jamyang.co.uk, andrew.stark@aptim-solutions.com)
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { runSyncIntegrationsCron } from "../app/lib/sync-integrations-cron.server";
import { notifyIntegrationsCronReport } from "./lib/integrations-cron-notify";

function logCronReport(result: Awaited<ReturnType<typeof runSyncIntegrationsCron>>) {
  console.log("\nWooCommerce orders");
  console.log(`  Created:          ${result.woocommerce.orders.created}`);
  console.log(`  Updated:          ${result.woocommerce.orders.updated}`);
  console.log(`  Linked to member: ${result.woocommerce.orders.membersLinked}`);
  if (result.woocommerce.orders.daysLimit) {
    console.log(`  Days window:      ${result.woocommerce.orders.daysLimit}`);
  }

  console.log("\nWooCommerce products");
  console.log(`  Created: ${result.woocommerce.products.created}`);
  console.log(`  Updated: ${result.woocommerce.products.updated}`);

  console.log("\nStripe balance transactions");
  console.log(`  Connections:       ${result.stripe.connectionsProcessed}`);
  console.log(`  Created:           ${result.stripe.created}`);
  console.log(`  Updated:           ${result.stripe.updated}`);
  console.log(`  Classified:        ${result.stripe.classified}`);
  console.log(`  Skipped (manual):  ${result.stripe.classificationSkippedManual}`);

  console.log("\nStripe → QuickBooks push");
  console.log(`  Eligible in window: ${result.quickbooks.stripePush.matchedFilter}`);
  console.log(`  Pushed:             ${result.quickbooks.stripePush.pushed}`);
  console.log(`  Skipped:            ${result.quickbooks.stripePush.skipped}`);
  console.log(`  Failed:             ${result.quickbooks.stripePush.failed}`);
  if (result.quickbooks.stripePush.skippedSample.length > 0) {
    console.log("  Skipped examples:");
    for (const row of result.quickbooks.stripePush.skippedSample) {
      console.log(`    ${row.stripeBalanceTransactionId}: ${row.reason}`);
    }
  }
  if (result.quickbooks.stripePush.failedSample.length > 0) {
    console.log("  Failed examples:");
    for (const row of result.quickbooks.stripePush.failedSample) {
      console.log(`    ${row.stripeBalanceTransactionId}: ${row.message}`);
    }
  }

  console.log("\nQuickBooks sales receipts");
  console.log(
    `  Created: ${result.quickbooks.salesReceipts.created}, updated: ${result.quickbooks.salesReceipts.updated}, tombstoned: ${result.quickbooks.salesReceipts.tombstoned}`,
  );

  console.log("\nQuickBooks refund receipts");
  console.log(
    `  Created: ${result.quickbooks.refundReceipts.created}, updated: ${result.quickbooks.refundReceipts.updated}, tombstoned: ${result.quickbooks.refundReceipts.tombstoned}`,
  );
}

async function sendReport(
  params: Parameters<typeof notifyIntegrationsCronReport>[0],
) {
  try {
    const report = await notifyIntegrationsCronReport(params);
    if (report.sent) {
      console.log(`\nCron report email sent (Resend id: ${report.resendMessageId})`);
      return;
    }
    console.warn(`\nCron report email not sent: ${report.reason}`);
  } catch (err) {
    console.error(
      "\nFailed to send cron report email:",
      err instanceof Error ? err.message : err,
    );
  }
}

try {
  console.log("Starting sequential integration sync (WooCommerce → Stripe → QuickBooks)…");

  const result = await runSyncIntegrationsCron();
  logCronReport(result);
  console.log("\nSequential sync complete.");
  await sendReport({ ok: true, result });
} catch (err) {
  const error = err instanceof Error ? err.message : String(err);
  console.error(error);
  await sendReport({ ok: false, error });
  process.exit(1);
} finally {
  await closeDb();
}
