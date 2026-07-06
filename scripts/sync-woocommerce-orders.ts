/**
 * Import WooCommerce orders into woocommerce_orders.
 *
 * Usage:
 *   npm run sync:woocommerce-orders
 *   npm run sync:woocommerce-orders -- --days 90
 *   npm run sync:woocommerce-orders -- --since 2024-01-01
 *
 * Optional env: WOO_SYNC_DAYS=90, WOO_SYNC_SINCE=2024-01-01
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { WOOCOMMERCE_ORDER_SYNC_DAYS } from "../app/lib/woocommerce-orders.constants";
import {
  parseWooSyncSinceDate,
  syncWooCommerceOrders,
} from "../app/lib/sync-woocommerce-orders.server";

const args = process.argv.slice(2);

const daysFlag = args.indexOf("--days");
const daysFromArg =
  daysFlag >= 0 ? Number(args[daysFlag + 1]) : Number.NaN;
const daysFromEnv = Number(process.env.WOO_SYNC_DAYS ?? "");
const days = Number.isFinite(daysFromArg) && daysFromArg > 0
  ? Math.floor(daysFromArg)
  : Number.isFinite(daysFromEnv) && daysFromEnv > 0
    ? Math.floor(daysFromEnv)
    : WOOCOMMERCE_ORDER_SYNC_DAYS;

const sinceFlag = args.indexOf("--since");
const sinceRaw =
  sinceFlag >= 0
    ? args[sinceFlag + 1]
    : process.env.WOO_SYNC_SINCE?.trim() || undefined;

let since: Date | undefined;
if (sinceRaw) {
  try {
    since = parseWooSyncSinceDate(sinceRaw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (daysFlag >= 0 && !Number.isFinite(daysFromArg)) {
  console.error("--days requires a positive number");
  process.exit(1);
}

if (sinceFlag >= 0 && !sinceRaw) {
  console.error("--since requires a date (YYYY-MM-DD)");
  process.exit(1);
}

try {
  console.log("Syncing WooCommerce orders…");
  if (since) {
    console.log(`Date range: from ${sinceRaw} (UTC) onward`);
  } else {
    console.log(`Date range: last ${days} day(s)`);
  }

  const result = await syncWooCommerceOrders({
    days: since ? undefined : days,
    since,
  });

  console.log("\nDone.");
  console.log(`  Created:          ${result.created}`);
  console.log(`  Updated:          ${result.updated}`);
  console.log(`  Processed:        ${result.processed}`);
  console.log(`  Linked to member: ${result.membersLinked}`);
  console.log(`  No billing email: ${result.skippedNoEmail}`);
  if (result.wooCommerceTotalInScope != null) {
    console.log(`  In scope (WC API): ${result.wooCommerceTotalInScope}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
