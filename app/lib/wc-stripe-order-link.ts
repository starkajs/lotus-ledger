import { and, eq, isNotNull, or, type SQL } from "drizzle-orm";
import {
  stripeBalanceTransactions,
  woocommerceOrders,
} from "~/db/schema";
import type { WooCommerceOrder } from "~/lib/woocommerce-api.server";

type StripeProductMatchStatus = "matched" | "unmatched" | "manual" | "ambiguous";

/** Stripe txn matches a WC order by `order_key` and/or WC `order_id` in metadata. */
export function stripeTransactionMatchesWooCommerceOrder(): SQL {
  return or(
    and(
      isNotNull(stripeBalanceTransactions.orderKey),
      isNotNull(woocommerceOrders.orderKey),
      eq(stripeBalanceTransactions.orderKey, woocommerceOrders.orderKey),
    ),
    and(
      isNotNull(stripeBalanceTransactions.wcOrderId),
      eq(stripeBalanceTransactions.wcOrderId, woocommerceOrders.wcOrderId),
    ),
  )!;
}

export function normalizeOrderKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** WC REST `order_key` (also present on synced `wc_raw`). */
export function extractOrderKeyFromWooCommerceOrder(
  order: WooCommerceOrder | Record<string, unknown>,
): string | null {
  const direct =
    typeof order.order_key === "string"
      ? order.order_key
      : typeof (order as { orderKey?: string }).orderKey === "string"
        ? (order as { orderKey: string }).orderKey
        : null;
  return normalizeOrderKey(direct);
}

export type WooCommerceOrderLotusProductRef = {
  catalogProductId: string;
  code: string;
  name: string;
  source: "manual" | "line";
};

/** Prefer manual Lotus product on the order, then first mapped line product. */
export function primaryLotusProductIdFromWooCommerceOrder(input: {
  productId: string | null;
  lotusProducts: WooCommerceOrderLotusProductRef[];
}): string | null {
  if (input.productId) return input.productId;
  return input.lotusProducts[0]?.catalogProductId ?? null;
}

export type LinkedStripeTransactionSummary = {
  id: string;
  stripeBalanceTransactionId: string;
  stripeCreatedAt: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  type: string;
  productCode: string | null;
  productName: string | null;
};

export function isStripeProductUnmatched(input: {
  productId: string | null;
  productMatchStatus: StripeProductMatchStatus | null;
}): boolean {
  if (!input.productId) return true;
  return (
    input.productMatchStatus === "unmatched" ||
    input.productMatchStatus === "ambiguous"
  );
}
