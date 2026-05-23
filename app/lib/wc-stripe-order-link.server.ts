import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "~/db";
import {
  products,
  stripeBalanceTransactions,
  woocommerceOrders,
} from "~/db/schema";
import { setStripeTransactionProductManual } from "~/lib/product-classification.server";
import type { IntegrationAuditContext } from "~/lib/integration-jobs.server";
import {
  extractOrderKeyFromStripeRaw,
  extractWcOrderIdFromStripeRaw,
} from "~/lib/stripe-transaction-signals";
import {
  extractOrderKeyFromWooCommerceOrder,
  normalizeOrderKey,
  primaryLotusProductIdFromWooCommerceOrder,
  stripeTransactionMatchesWooCommerceOrder,
  type LinkedStripeTransactionSummary,
} from "~/lib/wc-stripe-order-link";

export type { LinkedStripeTransactionSummary } from "~/lib/wc-stripe-order-link";
import { getWooCommerceOrderById } from "~/lib/woocommerce-orders.server";

export type LinkedWooCommerceOrderSummary = {
  id: string;
  wcOrderId: number;
  orderNumber: string | null;
  orderKey: string;
  status: string;
  totalMinor: number;
  currency: string;
  dateCreated: string;
};

function mapStripeLinkRow(row: {
  id: string;
  stripeBalanceTransactionId: string;
  stripeCreatedAt: Date;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  type: string;
  productCode: string | null;
  productName: string | null;
}): LinkedStripeTransactionSummary {
  return {
    id: row.id,
    stripeBalanceTransactionId: row.stripeBalanceTransactionId,
    stripeCreatedAt: row.stripeCreatedAt.toISOString(),
    amount: row.amount,
    fee: row.fee,
    net: row.net,
    currency: row.currency,
    type: row.type,
    productCode: row.productCode,
    productName: row.productName,
  };
}

const stripeLinkSelect = {
  id: stripeBalanceTransactions.id,
  stripeBalanceTransactionId:
    stripeBalanceTransactions.stripeBalanceTransactionId,
  stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
  amount: stripeBalanceTransactions.amount,
  fee: stripeBalanceTransactions.fee,
  net: stripeBalanceTransactions.net,
  currency: stripeBalanceTransactions.currency,
  type: stripeBalanceTransactions.type,
  productCode: products.code,
  productName: products.name,
};

export async function resolveOrderKeyForStripeTransaction(
  transactionId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderKey: stripeBalanceTransactions.orderKey,
      stripeRaw: stripeBalanceTransactions.stripeRaw,
    })
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.id, transactionId))
    .limit(1);

  if (!row) return null;
  return (
    normalizeOrderKey(row.orderKey) ??
    extractOrderKeyFromStripeRaw(row.stripeRaw ?? null)
  );
}

export async function resolveWcOrderIdForStripeTransaction(
  transactionId: string,
): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({
      wcOrderId: stripeBalanceTransactions.wcOrderId,
      stripeRaw: stripeBalanceTransactions.stripeRaw,
    })
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.id, transactionId))
    .limit(1);

  if (!row) return null;
  return (
    row.wcOrderId ?? extractWcOrderIdFromStripeRaw(row.stripeRaw ?? null)
  );
}

export async function findLinkedWooCommerceOrderForStripeTransaction(
  transactionId: string,
): Promise<LinkedWooCommerceOrderSummary | null> {
  const [orderKey, wcOrderId] = await Promise.all([
    resolveOrderKeyForStripeTransaction(transactionId),
    resolveWcOrderIdForStripeTransaction(transactionId),
  ]);
  if (!orderKey && !wcOrderId) return null;

  const linkParts = [];
  if (orderKey) {
    linkParts.push(eq(woocommerceOrders.orderKey, orderKey));
  }
  if (wcOrderId) {
    linkParts.push(eq(woocommerceOrders.wcOrderId, wcOrderId));
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: woocommerceOrders.id,
      wcOrderId: woocommerceOrders.wcOrderId,
      orderNumber: woocommerceOrders.orderNumber,
      orderKey: woocommerceOrders.orderKey,
      status: woocommerceOrders.status,
      totalMinor: woocommerceOrders.totalMinor,
      currency: woocommerceOrders.currency,
      dateCreated: woocommerceOrders.dateCreated,
    })
    .from(woocommerceOrders)
    .where(linkParts.length === 1 ? linkParts[0] : or(...linkParts))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    wcOrderId: row.wcOrderId,
    orderNumber: row.orderNumber,
    orderKey: normalizeOrderKey(row.orderKey) ?? orderKey ?? "",
    status: row.status,
    totalMinor: row.totalMinor,
    currency: row.currency,
    dateCreated: row.dateCreated.toISOString(),
  };
}

export async function findLinkedStripeTransactionsForWooCommerceOrder(
  orderId: string,
): Promise<LinkedStripeTransactionSummary[]> {
  const db = getDb();
  const [orderRow] = await db
    .select({
      orderKey: woocommerceOrders.orderKey,
      wcOrderId: woocommerceOrders.wcOrderId,
      wcRaw: woocommerceOrders.wcRaw,
    })
    .from(woocommerceOrders)
    .where(eq(woocommerceOrders.id, orderId))
    .limit(1);

  if (!orderRow) return [];

  const orderKey =
    normalizeOrderKey(orderRow.orderKey) ??
    extractOrderKeyFromWooCommerceOrder(orderRow.wcRaw ?? {});

  const matchParts = [];
  if (orderKey) {
    matchParts.push(eq(stripeBalanceTransactions.orderKey, orderKey));
  }
  if (orderRow.wcOrderId > 0) {
    matchParts.push(eq(stripeBalanceTransactions.wcOrderId, orderRow.wcOrderId));
  }
  if (matchParts.length === 0) return [];

  const rows = await db
    .select(stripeLinkSelect)
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(matchParts.length === 1 ? matchParts[0] : or(...matchParts))
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt));

  const seen = new Set<string>();
  const result: LinkedStripeTransactionSummary[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(mapStripeLinkRow(row));
  }
  return result;
}

export type LinkedStripeTransactionsBatch = {
  byOrderKey: Map<string, LinkedStripeTransactionSummary[]>;
  byWcOrderId: Map<number, LinkedStripeTransactionSummary[]>;
};

export async function findLinkedStripeTransactionsBatch(input: {
  orderKeys: string[];
  wcOrderIds: number[];
}): Promise<LinkedStripeTransactionsBatch> {
  const byOrderKey = new Map<string, LinkedStripeTransactionSummary[]>();
  const byWcOrderId = new Map<number, LinkedStripeTransactionSummary[]>();

  const keys = [
    ...new Set(
      input.orderKeys.map((k) => normalizeOrderKey(k)).filter(Boolean),
    ),
  ] as string[];
  const ids = [
    ...new Set(input.wcOrderIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];

  if (keys.length === 0 && ids.length === 0) {
    return { byOrderKey, byWcOrderId };
  }

  const matchParts = [];
  if (keys.length > 0) {
    matchParts.push(inArray(stripeBalanceTransactions.orderKey, keys));
  }
  if (ids.length > 0) {
    matchParts.push(inArray(stripeBalanceTransactions.wcOrderId, ids));
  }

  const db = getDb();
  const rows = await db
    .select({
      ...stripeLinkSelect,
      orderKey: stripeBalanceTransactions.orderKey,
      wcOrderId: stripeBalanceTransactions.wcOrderId,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(matchParts.length === 1 ? matchParts[0] : or(...matchParts))
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt));

  for (const row of rows) {
    const summary = mapStripeLinkRow(row);
    if (row.orderKey) {
      const list = byOrderKey.get(row.orderKey) ?? [];
      list.push(summary);
      byOrderKey.set(row.orderKey, list);
    }
    if (row.wcOrderId != null && row.wcOrderId > 0) {
      const list = byWcOrderId.get(row.wcOrderId) ?? [];
      if (!list.some((t) => t.id === summary.id)) {
        list.push(summary);
      }
      byWcOrderId.set(row.wcOrderId, list);
    }
  }

  return { byOrderKey, byWcOrderId };
}

/** @deprecated Use findLinkedStripeTransactionsBatch */
export async function findLinkedStripeTransactionsByOrderKeys(
  orderKeys: string[],
): Promise<Map<string, LinkedStripeTransactionSummary[]>> {
  const { byOrderKey } = await findLinkedStripeTransactionsBatch({
    orderKeys,
    wcOrderIds: [],
  });
  return byOrderKey;
}

export function mergeLinkedStripeTransactionsForOrder(input: {
  orderKey: string | null;
  wcOrderId: number;
  batch: LinkedStripeTransactionsBatch;
}): LinkedStripeTransactionSummary[] {
  const seen = new Set<string>();
  const merged: LinkedStripeTransactionSummary[] = [];

  const add = (list: LinkedStripeTransactionSummary[] | undefined) => {
    if (!list) return;
    for (const tx of list) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
      merged.push(tx);
    }
  };

  if (input.orderKey) {
    add(input.batch.byOrderKey.get(input.orderKey));
  }
  add(input.batch.byWcOrderId.get(input.wcOrderId));

  return merged;
}

export async function setStripeTransactionProductFromWooCommerceOrder(
  transactionId: string,
  wooCommerceOrderId: string,
  audit?: IntegrationAuditContext,
): Promise<
  | { ok: true; productId: string; productCode: string; productName: string }
  | { ok: false; reason: string }
> {
  const order = await getWooCommerceOrderById(wooCommerceOrderId);
  if (!order) {
    return { ok: false, reason: "WooCommerce order not found" };
  }

  const productId = primaryLotusProductIdFromWooCommerceOrder(order);
  if (!productId) {
    return {
      ok: false,
      reason: "Linked WooCommerce order has no Lotus product assigned",
    };
  }

  const lotus = order.lotusProducts.find((p) => p.catalogProductId === productId);
  await setStripeTransactionProductManual(transactionId, productId, audit);

  return {
    ok: true,
    productId,
    productCode: lotus?.code ?? "—",
    productName: lotus?.name ?? "Product",
  };
}

/** Backfill link columns from JSON when missing (post-migration). */
export async function backfillStripeOrderLinksFromRaw(): Promise<{
  orderKeys: number;
  wcOrderIds: number;
}> {
  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.id,
      orderKey: stripeBalanceTransactions.orderKey,
      wcOrderId: stripeBalanceTransactions.wcOrderId,
      stripeRaw: stripeBalanceTransactions.stripeRaw,
    })
    .from(stripeBalanceTransactions)
    .where(isNotNull(stripeBalanceTransactions.stripeRaw));

  let orderKeys = 0;
  let wcOrderIds = 0;
  for (const row of rows) {
    const raw = row.stripeRaw ?? null;
    const key = row.orderKey ?? extractOrderKeyFromStripeRaw(raw);
    const wcId = row.wcOrderId ?? extractWcOrderIdFromStripeRaw(raw);
    if (!key && wcId == null) continue;

    const patch: {
      orderKey?: string;
      wcOrderId?: number;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (key && !row.orderKey) {
      patch.orderKey = key;
      orderKeys++;
    }
    if (wcId != null && row.wcOrderId == null) {
      patch.wcOrderId = wcId;
      wcOrderIds++;
    }
    if (patch.orderKey === undefined && patch.wcOrderId === undefined) {
      continue;
    }

    await db
      .update(stripeBalanceTransactions)
      .set(patch)
      .where(eq(stripeBalanceTransactions.id, row.id));
  }
  return { orderKeys, wcOrderIds };
}

/** @deprecated Use backfillStripeOrderLinksFromRaw */
export async function backfillStripeOrderKeysFromRaw(): Promise<number> {
  const result = await backfillStripeOrderLinksFromRaw();
  return result.orderKeys;
}
