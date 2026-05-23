import { and, desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  products,
  stripeBalanceTransactions,
  woocommerceOrders,
} from "~/db/schema";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  type IsoDateString,
} from "~/lib/date-range-filters";
import {
  extractOrderKeyFromStripeRaw,
  extractWcOrderIdFromStripeRaw,
} from "~/lib/stripe-transaction-signals";
import { normalizeOrderKey, wooCommerceOrderMatchesStripeTransaction } from "~/lib/wc-stripe-order-link";
import {
  productForStripeTx,
  productForWcOrder,
  sortProductGroups,
  sumStripeTransactions,
  sumWcOrders,
  type WcOrderTotals,
  type CurrencyTotals,
} from "~/lib/wc-stripe-reconciliation-totals";

export type WcStripeReconciliationOrder = {
  id: string;
  wcOrderId: number;
  orderNumber: string | null;
  orderKey: string | null;
  status: string;
  totalMinor: number;
  currency: string;
  dateCreated: string;
  lotusProductId: string | null;
  lotusProductCode: string | null;
  lotusProductName: string | null;
};

export type WcStripeReconciliationStripe = {
  id: string;
  stripeBalanceTransactionId: string;
  stripeCreatedAt: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  orderKey: string | null;
  wcOrderId: number | null;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

export type WcStripeMatchedPair = {
  order: WcStripeReconciliationOrder;
  stripeTransactions: WcStripeReconciliationStripe[];
};

export type WcStripeReconciliationByStatus = {
  status: string;
  orders: WcStripeReconciliationOrder[];
  wcTotals: WcOrderTotals[];
};

export type WcStripeReconciliationByProduct = {
  productKey: string;
  productCode: string | null;
  productName: string;
  transactions: WcStripeReconciliationStripe[];
  stripeTotals: CurrencyTotals[];
};

export type WcStripeReconciliationWcByProduct = {
  productKey: string;
  productCode: string | null;
  productName: string;
  orders: WcStripeReconciliationOrder[];
  wcTotals: WcOrderTotals[];
};

export type WcStripeReconciliationData = {
  matched: WcStripeMatchedPair[];
  unmatchedWcByStatus: WcStripeReconciliationByStatus[];
  unmatchedWcByProduct: WcStripeReconciliationWcByProduct[];
  unmatchedStripeByProduct: WcStripeReconciliationByProduct[];
  counts: {
    wcOrders: number;
    stripeTransactions: number;
    matched: number;
    unmatchedWc: number;
    unmatchedStripe: number;
  };
};

function wcDateWhere(dateFrom: IsoDateString, dateTo: IsoDateString) {
  return and(
    calendarDateCreatedGte(woocommerceOrders.dateCreated, dateFrom),
    calendarDateCreatedLte(woocommerceOrders.dateCreated, dateTo),
  );
}

function stripeDateWhere(dateFrom: IsoDateString, dateTo: IsoDateString) {
  return and(
    calendarDateCreatedGte(stripeBalanceTransactions.stripeCreatedAt, dateFrom),
    calendarDateCreatedLte(stripeBalanceTransactions.stripeCreatedAt, dateTo),
  );
}

async function loadOrdersInRange(
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
): Promise<WcStripeReconciliationOrder[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: woocommerceOrders.id,
      wcOrderId: woocommerceOrders.wcOrderId,
      orderNumber: woocommerceOrders.orderNumber,
      orderKey: woocommerceOrders.orderKey,
      status: woocommerceOrders.status,
      totalMinor: woocommerceOrders.totalMinor,
      currency: woocommerceOrders.currency,
      dateCreated: woocommerceOrders.dateCreated,
      lotusProductId: woocommerceOrders.productId,
      productCode: products.code,
      productName: products.name,
    })
    .from(woocommerceOrders)
    .leftJoin(products, eq(woocommerceOrders.productId, products.id))
    .where(wcDateWhere(dateFrom, dateTo))
    .orderBy(desc(woocommerceOrders.dateCreated));

  return rows.map((row) => ({
    id: row.id,
    wcOrderId: row.wcOrderId,
    orderNumber: row.orderNumber,
    orderKey: row.orderKey,
    status: row.status,
    totalMinor: row.totalMinor,
    currency: row.currency,
    dateCreated: row.dateCreated.toISOString(),
    lotusProductId: row.lotusProductId,
    lotusProductCode: row.productCode,
    lotusProductName: row.productName,
  }));
}

async function loadStripeInRange(
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
): Promise<WcStripeReconciliationStripe[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.id,
      stripeBalanceTransactionId:
        stripeBalanceTransactions.stripeBalanceTransactionId,
      stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      amount: stripeBalanceTransactions.amount,
      fee: stripeBalanceTransactions.fee,
      net: stripeBalanceTransactions.net,
      currency: stripeBalanceTransactions.currency,
      orderKey: stripeBalanceTransactions.orderKey,
      wcOrderId: stripeBalanceTransactions.wcOrderId,
      stripeRaw: stripeBalanceTransactions.stripeRaw,
      productId: stripeBalanceTransactions.productId,
      productCode: products.code,
      productName: products.name,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(stripeDateWhere(dateFrom, dateTo))
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt));

  return rows.map((row) => ({
    id: row.id,
    stripeBalanceTransactionId: row.stripeBalanceTransactionId,
    stripeCreatedAt: row.stripeCreatedAt.toISOString(),
    amount: row.amount,
    fee: row.fee,
    net: row.net,
    currency: row.currency,
    orderKey:
      normalizeOrderKey(row.orderKey) ??
      extractOrderKeyFromStripeRaw(row.stripeRaw ?? null),
    wcOrderId:
      row.wcOrderId ?? extractWcOrderIdFromStripeRaw(row.stripeRaw ?? null),
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
  }));
}

function groupUnmatchedWcByStatus(
  orders: WcStripeReconciliationOrder[],
): WcStripeReconciliationByStatus[] {
  const byStatus = new Map<string, WcStripeReconciliationOrder[]>();
  for (const order of orders) {
    const list = byStatus.get(order.status) ?? [];
    list.push(order);
    byStatus.set(order.status, list);
  }
  return [...byStatus.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, statusOrders]) => ({
      status,
      orders: statusOrders,
      wcTotals: sumWcOrders(statusOrders),
    }));
}

function groupUnmatchedWcByProduct(
  orders: WcStripeReconciliationOrder[],
): WcStripeReconciliationWcByProduct[] {
  const byProduct = new Map<string, WcStripeReconciliationWcByProduct>();
  for (const order of orders) {
    const { productKey, productCode, productName } = productForWcOrder(order);
    let group = byProduct.get(productKey);
    if (!group) {
      group = {
        productKey,
        productCode,
        productName,
        orders: [],
        wcTotals: [],
      };
      byProduct.set(productKey, group);
    }
    group.orders.push(order);
  }
  for (const group of byProduct.values()) {
    group.wcTotals = sumWcOrders(group.orders);
  }
  return sortProductGroups([...byProduct.values()]);
}

function groupUnmatchedStripeByProduct(
  transactions: WcStripeReconciliationStripe[],
): WcStripeReconciliationByProduct[] {
  const byProduct = new Map<string, WcStripeReconciliationByProduct>();
  for (const tx of transactions) {
    const { productKey, productCode, productName } = productForStripeTx(tx);
    let group = byProduct.get(productKey);
    if (!group) {
      group = {
        productKey,
        productCode,
        productName,
        transactions: [],
        stripeTotals: [],
      };
      byProduct.set(productKey, group);
    }
    group.transactions.push(tx);
  }
  for (const group of byProduct.values()) {
    group.stripeTotals = sumStripeTransactions(group.transactions);
  }
  return sortProductGroups([...byProduct.values()]);
}

export async function loadWcStripeReconciliation(input: {
  dateFrom: IsoDateString;
  dateTo: IsoDateString;
}): Promise<WcStripeReconciliationData> {
  const [orders, stripeTransactions] = await Promise.all([
    loadOrdersInRange(input.dateFrom, input.dateTo),
    loadStripeInRange(input.dateFrom, input.dateTo),
  ]);

  const matched: WcStripeMatchedPair[] = [];
  const unmatchedWc: WcStripeReconciliationOrder[] = [];
  const unmatchedStripe: WcStripeReconciliationStripe[] = [];
  const matchedStripeIds = new Set<string>();

  for (const order of orders) {
    const linked = stripeTransactions.filter((tx) =>
      wooCommerceOrderMatchesStripeTransaction(order, tx),
    );
    if (linked.length > 0) {
      matched.push({ order, stripeTransactions: linked });
      for (const tx of linked) {
        matchedStripeIds.add(tx.id);
      }
    } else {
      unmatchedWc.push(order);
    }
  }

  for (const tx of stripeTransactions) {
    if (!matchedStripeIds.has(tx.id)) {
      unmatchedStripe.push(tx);
    }
  }

  return {
    matched,
    unmatchedWcByStatus: groupUnmatchedWcByStatus(unmatchedWc),
    unmatchedWcByProduct: groupUnmatchedWcByProduct(unmatchedWc),
    unmatchedStripeByProduct: groupUnmatchedStripeByProduct(unmatchedStripe),
    counts: {
      wcOrders: orders.length,
      stripeTransactions: stripeTransactions.length,
      matched: matched.length,
      unmatchedWc: unmatchedWc.length,
      unmatchedStripe: unmatchedStripe.length,
    },
  };
}
