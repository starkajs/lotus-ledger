import { max } from "drizzle-orm";
import { getDb } from "~/db";
import { woocommerceOrders } from "~/db/schema";
import type { IntegrationAuditContext } from "~/lib/integration-jobs";
import { syncWooCommerceOrders } from "~/lib/sync-woocommerce-orders.server";
import {
  WOOCOMMERCE_ORDER_APP_SYNC_DAYS,
  WOOCOMMERCE_ORDER_SYNC_DAYS_MAX,
} from "~/lib/woocommerce-orders.constants";
import { syncWooCommerceProductsFromApi } from "~/lib/woocommerce-products.server";

export type WooCommerceRefreshAllStep = {
  key: string;
  label: string;
  ok: boolean;
  detail: string | null;
  error: string | null;
};

function daysAgoUtc(days: number): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.floor(days));
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

function formatSince(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

async function runStep(
  key: string,
  label: string,
  sync: () => Promise<string>,
): Promise<WooCommerceRefreshAllStep> {
  try {
    return { key, label, ok: true, detail: await sync(), error: null };
  } catch (err) {
    return {
      key,
      label,
      ok: false,
      detail: null,
      error: err instanceof Error ? err.message : "Refresh failed",
    };
  }
}

/** Last 30 days, or from the newest stored order when that is older. Capped at 90 days. */
async function wooOrderCatchUpSince(): Promise<Date> {
  const rolling = daysAgoUtc(WOOCOMMERCE_ORDER_APP_SYNC_DAYS);
  const floor = daysAgoUtc(WOOCOMMERCE_ORDER_SYNC_DAYS_MAX);
  const db = getDb();
  const [row] = await db
    .select({ value: max(woocommerceOrders.dateCreated) })
    .from(woocommerceOrders);
  const newest = row?.value ?? null;
  if (!newest || newest >= rolling) return rolling;
  return newest < floor ? floor : newest;
}

/**
 * Pull WooCommerce orders, then the product catalog. A failed list is reported
 * and the other list still runs.
 */
export async function refreshAllWooCommerce(
  audit: IntegrationAuditContext,
): Promise<WooCommerceRefreshAllStep[]> {
  const orders = await runStep("orders", "Orders", async () => {
    const since = await wooOrderCatchUpSince();
    const result = await syncWooCommerceOrders({ since, audit });
    return `${result.processed} orders (${result.created} new, ${result.updated} updated), from ${formatSince(since)}`;
  });
  const products = await runStep("products", "Products", async () => {
    const result = await syncWooCommerceProductsFromApi({ audit });
    const total = result.created + result.updated;
    return `${total} products (${result.created} new, ${result.updated} updated)`;
  });
  return [orders, products];
}
