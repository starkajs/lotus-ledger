/**
 * Report WooCommerce order totals (store API vs default sync window).
 *
 *   npx tsx scripts/count-woocommerce-orders.ts
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { listWooCommerceOrders } from "../app/lib/woocommerce-api.server";
import {
  countWooCommerceOrders,
  WOOCOMMERCE_ORDER_SYNC_DAYS,
} from "../app/lib/woocommerce-orders.server";

const sinceFlag = process.argv.indexOf("--since");
const sinceRaw =
  sinceFlag >= 0
    ? process.argv[sinceFlag + 1]
    : undefined;

const defaultSince = new Date();
defaultSince.setDate(defaultSince.getDate() - WOOCOMMERCE_ORDER_SYNC_DAYS);

const windowSince = sinceRaw
  ? new Date(Date.UTC(
      Number(sinceRaw.slice(0, 4)),
      Number(sinceRaw.slice(5, 7)) - 1,
      Number(sinceRaw.slice(8, 10)),
    ))
  : defaultSince;
const after = windowSince.toISOString();

const [all, windowed, inDb] = await Promise.all([
  listWooCommerceOrders({ page: 1, perPage: 1, status: "any" }),
  listWooCommerceOrders({ page: 1, perPage: 1, status: "any", after }),
  countWooCommerceOrders(),
]);

console.log("WooCommerce order counts");
console.log(`  Store total (all time):              ${all.total}`);
console.log(
  sinceRaw
    ? `  Since ${sinceRaw}:                        ${windowed.total}`
    : `  Default sync window (${WOOCOMMERCE_ORDER_SYNC_DAYS} days): ${windowed.total}`,
);
console.log(`  Already in Lotus Ledger DB:          ${inDb}`);
console.log(
  `  Outside default window:              ${Math.max(0, all.total - windowed.total)}`,
);
console.log(`  Sync window since (UTC):             ${after.slice(0, 10)}`);

await closeDb();
