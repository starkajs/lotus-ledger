import type { IntegrationAuditContext } from "~/lib/integration-jobs";
import { syncWooCommerceOrders } from "~/lib/sync-woocommerce-orders.server";
import { syncWooCommerceProductsFromApi } from "~/lib/woocommerce-products.server";

export type WooCommerceRefreshAllStep = {
  key: string;
  label: string;
  ok: boolean;
  detail: string | null;
  error: string | null;
};

function formatSince(iso: string | undefined): string {
  if (!iso) return "the usual window";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso));
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

/**
 * Pull WooCommerce orders, then the product catalog. A failed list is reported
 * and the other list still runs.
 */
export async function refreshAllWooCommerce(
  audit: IntegrationAuditContext,
): Promise<WooCommerceRefreshAllStep[]> {
  const orders = await runStep("orders", "Orders", async () => {
    const result = await syncWooCommerceOrders({ audit });
    return `${result.processed} orders (${result.created} new, ${result.updated} updated), from ${formatSince(result.after)}`;
  });
  const products = await runStep("products", "Products", async () => {
    const result = await syncWooCommerceProductsFromApi({ audit });
    const total = result.created + result.updated;
    return `${total} products (${result.created} new, ${result.updated} updated)`;
  });
  return [orders, products];
}
