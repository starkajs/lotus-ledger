import { and, eq, isNotNull, or, type SQL } from "drizzle-orm";
import {
  stripeBalanceTransactions,
  woocommerceOrders,
} from "~/db/schema";
import type { WooCommerceOrder } from "~/lib/woocommerce-api.server";

type StripeProductMatchStatus =
  | "matched"
  | "unmatched"
  | "manual"
  | "ambiguous"
  | "woocommerce";

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

/** In-memory link check (order_key and/or WC order id). */
export function wooCommerceOrderMatchesStripeTransaction(
  order: { orderKey: string | null; wcOrderId: number },
  stripe: { orderKey: string | null; wcOrderId: number | null },
): boolean {
  const orderKey = normalizeOrderKey(order.orderKey);
  const stripeKey = normalizeOrderKey(stripe.orderKey);
  if (orderKey && stripeKey && orderKey === stripeKey) return true;
  if (
    stripe.wcOrderId != null &&
    stripe.wcOrderId > 0 &&
    stripe.wcOrderId === order.wcOrderId
  ) {
    return true;
  }
  return false;
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

/**
 * Lotus product a Stripe charge should inherit from its WooCommerce order.
 * An explicit assignment on the order wins. Otherwise every mapped line must
 * agree on the same catalog product.
 */
export function lotusProductIdForStripeFromWooCommerceOrder(input: {
  productId: string | null;
  lineCatalogProductIds: Array<string | null | undefined>;
}): string | null {
  if (input.productId) return input.productId;
  const ids = [
    ...new Set(
      input.lineCatalogProductIds.filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 1) return ids[0]!;
  return null;
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
