import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "~/db";
import {
  stripeBalanceTransactions,
  woocommerceOrders,
  woocommerceProducts,
  type WooCommerceOrderLineItem,
} from "~/db/schema";
import { lotusProductIdForStripeFromWooCommerceOrder } from "~/lib/wc-stripe-order-link";

export type WooCommerceLotusProductIndex = {
  byOrderKey: Map<string, string | null>;
  byWcOrderId: Map<number, string | null>;
};

function remember<K>(map: Map<K, string | null>, key: K, productId: string | null) {
  if (!map.has(key)) {
    map.set(key, productId);
    return;
  }
  if (map.get(key) !== productId) {
    map.set(key, null);
  }
}

function indexOrders(
  orders: Array<{
    orderKey: string | null;
    wcOrderId: number;
    productId: string | null;
    lineItems: WooCommerceOrderLineItem[] | null;
  }>,
  lotusByWcProductId: Map<number, string>,
): WooCommerceLotusProductIndex {
  const byOrderKey = new Map<string, string | null>();
  const byWcOrderId = new Map<number, string | null>();

  for (const order of orders) {
    const lineCatalogProductIds = (order.lineItems ?? []).map((line) => {
      if (line.productId == null || line.productId <= 0) return null;
      return lotusByWcProductId.get(line.productId) ?? null;
    });
    const productId = lotusProductIdForStripeFromWooCommerceOrder({
      productId: order.productId,
      lineCatalogProductIds,
    });
    const key = order.orderKey?.trim();
    if (key) remember(byOrderKey, key, productId);
    if (order.wcOrderId > 0) remember(byWcOrderId, order.wcOrderId, productId);
  }

  return { byOrderKey, byWcOrderId };
}

async function lotusProductIdByWcProductId(
  wcProductIds: number[],
): Promise<Map<number, string>> {
  if (wcProductIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      wcProductId: woocommerceProducts.wcProductId,
      productId: woocommerceProducts.productId,
    })
    .from(woocommerceProducts)
    .where(
      and(
        inArray(woocommerceProducts.wcProductId, wcProductIds),
        isNotNull(woocommerceProducts.productId),
      ),
    );

  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.productId) map.set(row.wcProductId, row.productId);
  }
  return map;
}

export function lotusProductIdFromIndex(
  index: WooCommerceLotusProductIndex,
  link: { orderKey: string | null; wcOrderId: number | null },
): string | null {
  const key = link.orderKey?.trim();
  if (key && index.byOrderKey.has(key)) {
    return index.byOrderKey.get(key) ?? null;
  }
  if (link.wcOrderId != null && link.wcOrderId > 0 && index.byWcOrderId.has(link.wcOrderId)) {
    return index.byWcOrderId.get(link.wcOrderId) ?? null;
  }
  return null;
}

/** Every synced order, resolved to the one Lotus product a Stripe charge should inherit. */
export async function loadWooCommerceLotusProductIndex(): Promise<WooCommerceLotusProductIndex> {
  const db = getDb();
  const orders = await db
    .select({
      orderKey: woocommerceOrders.orderKey,
      wcOrderId: woocommerceOrders.wcOrderId,
      productId: woocommerceOrders.productId,
      lineItems: woocommerceOrders.lineItems,
    })
    .from(woocommerceOrders);

  const wcProductIds = new Set<number>();
  for (const order of orders) {
    for (const line of order.lineItems ?? []) {
      if (line.productId != null && line.productId > 0) {
        wcProductIds.add(line.productId);
      }
    }
  }

  const lotusByWcProductId = await lotusProductIdByWcProductId([...wcProductIds]);
  return indexOrders(orders, lotusByWcProductId);
}

/** Lotus product for one Stripe charge, from its linked WooCommerce order. */
export async function lotusProductIdForStripeLink(link: {
  orderKey: string | null;
  wcOrderId: number | null;
}): Promise<string | null> {
  const key = link.orderKey?.trim() || null;
  const wcOrderId =
    link.wcOrderId != null && link.wcOrderId > 0 ? link.wcOrderId : null;
  if (!key && wcOrderId == null) return null;

  const db = getDb();
  const parts = [];
  if (key) parts.push(eq(woocommerceOrders.orderKey, key));
  if (wcOrderId != null) parts.push(eq(woocommerceOrders.wcOrderId, wcOrderId));

  const orders = await db
    .select({
      orderKey: woocommerceOrders.orderKey,
      wcOrderId: woocommerceOrders.wcOrderId,
      productId: woocommerceOrders.productId,
      lineItems: woocommerceOrders.lineItems,
    })
    .from(woocommerceOrders)
    .where(parts.length === 1 ? parts[0] : or(...parts));

  if (orders.length === 0) return null;

  const wcProductIds = new Set<number>();
  for (const order of orders) {
    for (const line of order.lineItems ?? []) {
      if (line.productId != null && line.productId > 0) {
        wcProductIds.add(line.productId);
      }
    }
  }

  const lotusByWcProductId = await lotusProductIdByWcProductId([...wcProductIds]);
  return lotusProductIdFromIndex(indexOrders(orders, lotusByWcProductId), {
    orderKey: key,
    wcOrderId,
  });
}

/**
 * Stripe charges linked to these WooCommerce products or orders.
 * Skips manual assignments and charges already pushed to QuickBooks.
 */
export async function listStripeTransactionIdsForWooCommerceLinks(input: {
  wcProductIds?: number[];
  woocommerceProductRowIds?: string[];
  woocommerceOrderIds?: string[];
}): Promise<string[]> {
  const db = getDb();
  const orderIds = new Set(
    (input.woocommerceOrderIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const wcProductIds = new Set(
    (input.wcProductIds ?? []).filter((id) => Number.isInteger(id) && id > 0),
  );

  const rowIds = [
    ...new Set(
      (input.woocommerceProductRowIds ?? []).map((id) => id.trim()).filter(Boolean),
    ),
  ];
  if (rowIds.length > 0) {
    const rows = await db
      .select({ wcProductId: woocommerceProducts.wcProductId })
      .from(woocommerceProducts)
      .where(inArray(woocommerceProducts.id, rowIds));
    for (const row of rows) {
      if (row.wcProductId > 0) wcProductIds.add(row.wcProductId);
    }
  }

  const shopProductIds = [...wcProductIds];
  if (shopProductIds.length > 0) {
    const rows = await db
      .select({ id: woocommerceOrders.id })
      .from(woocommerceOrders)
      .where(
        sql`exists (
          select 1
          from jsonb_array_elements(coalesce(${woocommerceOrders.lineItems}, '[]'::jsonb)) as line(elem)
          where coalesce((line.elem->>'productId')::int, 0) in (${sql.join(
            shopProductIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        )`,
      );
    for (const row of rows) orderIds.add(row.id);
  }

  if (orderIds.size === 0) return [];

  const orders = await db
    .select({
      orderKey: woocommerceOrders.orderKey,
      wcOrderId: woocommerceOrders.wcOrderId,
    })
    .from(woocommerceOrders)
    .where(inArray(woocommerceOrders.id, [...orderIds]));

  const keys = [
    ...new Set(
      orders
        .map((order) => order.orderKey?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  const wcOrderIds = [
    ...new Set(orders.map((order) => order.wcOrderId).filter((id) => id > 0)),
  ];
  const linkParts = [];
  if (keys.length > 0) {
    linkParts.push(inArray(stripeBalanceTransactions.orderKey, keys));
  }
  if (wcOrderIds.length > 0) {
    linkParts.push(inArray(stripeBalanceTransactions.wcOrderId, wcOrderIds));
  }
  if (linkParts.length === 0) return [];

  const transactions = await db
    .select({ id: stripeBalanceTransactions.id })
    .from(stripeBalanceTransactions)
    .where(
      and(
        linkParts.length === 1 ? linkParts[0] : or(...linkParts),
        or(
          isNull(stripeBalanceTransactions.productMatchStatus),
          ne(stripeBalanceTransactions.productMatchStatus, "manual"),
        ),
        or(
          isNull(stripeBalanceTransactions.pushedToQuickbooks),
          eq(stripeBalanceTransactions.pushedToQuickbooks, false),
        ),
      ),
    );

  return transactions.map((row) => row.id);
}
