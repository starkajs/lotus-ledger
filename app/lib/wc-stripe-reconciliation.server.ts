import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
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

/** Order in this period, Stripe charge on another date. */
export type WcStripeOtherPeriodPair = {
  order: WcStripeReconciliationOrder;
  stripeTransactions: WcStripeReconciliationStripe[];
};

/** Stripe charge in this period, WooCommerce order on another date. */
export type StripeWcOtherPeriodPair = {
  stripe: WcStripeReconciliationStripe;
  order: WcStripeReconciliationOrder;
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
  /** Failed, pending, or cancelled orders. No Stripe balance transaction exists. */
  noStripeChargeByStatus: WcStripeReconciliationByStatus[];
  /** Paid orders whose Stripe charge falls outside this period. */
  wcStripeOtherPeriod: WcStripeOtherPeriodPair[];
  unmatchedStripeByProduct: WcStripeReconciliationByProduct[];
  /** Stripe charges whose WooCommerce order falls outside this period. */
  stripeWcOtherPeriod: StripeWcOtherPeriodPair[];
  counts: {
    wcOrders: number;
    stripeTransactions: number;
    matched: number;
    unmatchedWc: number;
    noStripeCharge: number;
    wcStripeOtherPeriod: number;
    unmatchedStripe: number;
    stripeWcOtherPeriod: number;
  };
};

/** Shop statuses where the customer did not pay, so Stripe has nothing to match. */
const WC_STATUSES_WITHOUT_STRIPE_CHARGE = new Set([
  "failed",
  "pending",
  "cancelled",
  "canceled",
  "checkout-draft",
]);

export function wcOrderHasNoStripeCharge(status: string): boolean {
  return WC_STATUSES_WITHOUT_STRIPE_CHARGE.has(status.trim().toLowerCase());
}

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
    .select(orderSelect)
    .from(woocommerceOrders)
    .leftJoin(products, eq(woocommerceOrders.productId, products.id))
    .where(wcDateWhere(dateFrom, dateTo))
    .orderBy(desc(woocommerceOrders.dateCreated));

  return rows.map(orderRowToRecord);
}

async function loadStripeInRange(
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
): Promise<WcStripeReconciliationStripe[]> {
  const db = getDb();
  const rows = await db
    .select(stripeSelect)
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(stripeDateWhere(dateFrom, dateTo))
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt));

  return rows.map(stripeRowToRecord);
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

function londonCalendarDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function isOutsidePeriod(iso: string, dateFrom: string, dateTo: string): boolean {
  const day = londonCalendarDate(iso);
  return day < dateFrom || day > dateTo;
}

function anyLink(parts: SQL[]): SQL | undefined {
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return or(...parts);
}

type OrderRow = {
  id: string;
  wcOrderId: number;
  orderNumber: string | null;
  orderKey: string | null;
  status: string;
  totalMinor: number;
  currency: string;
  dateCreated: Date;
  lotusProductId: string | null;
  productCode: string | null;
  productName: string | null;
};

function orderRowToRecord(row: OrderRow): WcStripeReconciliationOrder {
  return {
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
  };
}

type StripeRow = {
  id: string;
  stripeBalanceTransactionId: string;
  stripeCreatedAt: Date;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  orderKey: string | null;
  wcOrderId: number | null;
  stripeRaw: Record<string, unknown> | null;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

function stripeRowToRecord(row: StripeRow): WcStripeReconciliationStripe {
  return {
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
  };
}

const orderSelect = {
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
};

const stripeSelect = {
  id: stripeBalanceTransactions.id,
  stripeBalanceTransactionId: stripeBalanceTransactions.stripeBalanceTransactionId,
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
};

async function loadStripeLinkedToOrders(
  orders: WcStripeReconciliationOrder[],
): Promise<WcStripeReconciliationStripe[]> {
  const keys = [
    ...new Set(
      orders
        .map((order) => normalizeOrderKey(order.orderKey))
        .filter((key): key is string => key != null),
    ),
  ];
  const ids = [...new Set(orders.map((order) => order.wcOrderId).filter((id) => id > 0))];
  const parts: SQL[] = [];
  if (keys.length > 0) parts.push(inArray(stripeBalanceTransactions.orderKey, keys));
  if (ids.length > 0) parts.push(inArray(stripeBalanceTransactions.wcOrderId, ids));
  const where = anyLink(parts);
  if (!where) return [];

  const db = getDb();
  const rows = await db
    .select(stripeSelect)
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(where)
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt));
  return rows.map(stripeRowToRecord);
}

async function loadOrdersLinkedToStripe(
  transactions: WcStripeReconciliationStripe[],
): Promise<WcStripeReconciliationOrder[]> {
  const keys = [
    ...new Set(
      transactions
        .map((tx) => normalizeOrderKey(tx.orderKey))
        .filter((key): key is string => key != null),
    ),
  ];
  const ids = [
    ...new Set(
      transactions
        .map((tx) => tx.wcOrderId)
        .filter((id): id is number => id != null && id > 0),
    ),
  ];
  const parts: SQL[] = [];
  if (keys.length > 0) parts.push(inArray(woocommerceOrders.orderKey, keys));
  if (ids.length > 0) parts.push(inArray(woocommerceOrders.wcOrderId, ids));
  const where = anyLink(parts);
  if (!where) return [];

  const db = getDb();
  const rows = await db
    .select(orderSelect)
    .from(woocommerceOrders)
    .leftJoin(products, eq(woocommerceOrders.productId, products.id))
    .where(where)
    .orderBy(desc(woocommerceOrders.dateCreated));
  return rows.map(orderRowToRecord);
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
  const noStripeCharge: WcStripeReconciliationOrder[] = [];
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
    } else if (wcOrderHasNoStripeCharge(order.status)) {
      noStripeCharge.push(order);
    } else {
      unmatchedWc.push(order);
    }
  }

  for (const tx of stripeTransactions) {
    if (!matchedStripeIds.has(tx.id)) {
      unmatchedStripe.push(tx);
    }
  }

  const [linkedStripe, linkedOrders] = await Promise.all([
    loadStripeLinkedToOrders(unmatchedWc),
    loadOrdersLinkedToStripe(unmatchedStripe),
  ]);

  const wcStripeOtherPeriod: WcStripeOtherPeriodPair[] = [];
  const unmatchedWcInPeriod: WcStripeReconciliationOrder[] = [];
  for (const order of unmatchedWc) {
    const linked = linkedStripe.filter(
      (tx) =>
        wooCommerceOrderMatchesStripeTransaction(order, tx) &&
        isOutsidePeriod(tx.stripeCreatedAt, input.dateFrom, input.dateTo),
    );
    if (linked.length > 0) {
      wcStripeOtherPeriod.push({ order, stripeTransactions: linked });
    } else {
      unmatchedWcInPeriod.push(order);
    }
  }

  const stripeWcOtherPeriod: StripeWcOtherPeriodPair[] = [];
  const unmatchedStripeInPeriod: WcStripeReconciliationStripe[] = [];
  for (const tx of unmatchedStripe) {
    const order = linkedOrders.find(
      (candidate) =>
        wooCommerceOrderMatchesStripeTransaction(candidate, tx) &&
        isOutsidePeriod(candidate.dateCreated, input.dateFrom, input.dateTo),
    );
    if (order) {
      stripeWcOtherPeriod.push({ stripe: tx, order });
    } else {
      unmatchedStripeInPeriod.push(tx);
    }
  }

  return {
    matched,
    unmatchedWcByStatus: groupUnmatchedWcByStatus(unmatchedWcInPeriod),
    unmatchedWcByProduct: groupUnmatchedWcByProduct(unmatchedWcInPeriod),
    noStripeChargeByStatus: groupUnmatchedWcByStatus(noStripeCharge),
    wcStripeOtherPeriod,
    unmatchedStripeByProduct: groupUnmatchedStripeByProduct(unmatchedStripeInPeriod),
    stripeWcOtherPeriod,
    counts: {
      wcOrders: orders.length,
      stripeTransactions: stripeTransactions.length,
      matched: matched.length,
      unmatchedWc: unmatchedWcInPeriod.length,
      noStripeCharge: noStripeCharge.length,
      wcStripeOtherPeriod: wcStripeOtherPeriod.length,
      unmatchedStripe: unmatchedStripeInPeriod.length,
      stripeWcOtherPeriod: stripeWcOtherPeriod.length,
    },
  };
}
