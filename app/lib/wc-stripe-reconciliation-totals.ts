import type {
  WcStripeMatchedPair,
  WcStripeReconciliationOrder,
  WcStripeReconciliationStripe,
} from "~/lib/wc-stripe-reconciliation.server";

export type CurrencyTotals = {
  currency: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
};

export type WcOrderTotals = {
  currency: string;
  totalMinor: number;
};

export function sumStripeTransactions(
  transactions: WcStripeReconciliationStripe[],
): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const tx of transactions) {
    const currency = tx.currency.toLowerCase();
    const row = byCurrency.get(currency) ?? {
      currency,
      grossMinor: 0,
      feeMinor: 0,
      netMinor: 0,
    };
    row.grossMinor += tx.amount;
    row.feeMinor += tx.fee;
    row.netMinor += tx.net;
    byCurrency.set(currency, row);
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

export function sumWcOrders(
  orders: WcStripeReconciliationOrder[],
): WcOrderTotals[] {
  const byCurrency = new Map<string, number>();
  for (const order of orders) {
    const currency = order.currency.toLowerCase();
    byCurrency.set(
      currency,
      (byCurrency.get(currency) ?? 0) + order.totalMinor,
    );
  }
  return [...byCurrency.entries()]
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function sumMatchedStripeTotals(
  matched: WcStripeMatchedPair[],
): CurrencyTotals[] {
  const seen = new Set<string>();
  const txs: WcStripeReconciliationStripe[] = [];
  for (const { stripeTransactions } of matched) {
    for (const tx of stripeTransactions) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
      txs.push(tx);
    }
  }
  return sumStripeTransactions(txs);
}

export function sumMatchedWcOrderTotals(
  matched: WcStripeMatchedPair[],
): WcOrderTotals[] {
  return sumWcOrders(matched.map((p) => p.order));
}

export type LotusProductRef = {
  productKey: string;
  productCode: string | null;
  productName: string;
};

/** Stripe classification first, then WC manual product. */
export function productForMatchedPair(pair: WcStripeMatchedPair): LotusProductRef {
  const stripeWithProduct = pair.stripeTransactions.find((t) => t.productId);
  if (stripeWithProduct?.productId) {
    return {
      productKey: stripeWithProduct.productId,
      productCode: stripeWithProduct.productCode,
      productName: stripeWithProduct.productName ?? "Product",
    };
  }
  if (pair.order.lotusProductId) {
    return {
      productKey: pair.order.lotusProductId,
      productCode: pair.order.lotusProductCode,
      productName: pair.order.lotusProductName ?? "Product",
    };
  }
  return {
    productKey: "unmapped",
    productCode: null,
    productName: "Unmapped",
  };
}

export function productForWcOrder(order: WcStripeReconciliationOrder): LotusProductRef {
  if (order.lotusProductId) {
    return {
      productKey: order.lotusProductId,
      productCode: order.lotusProductCode,
      productName: order.lotusProductName ?? "Product",
    };
  }
  return {
    productKey: "unmapped",
    productCode: null,
    productName: "Unmapped",
  };
}

export function productForStripeTx(
  tx: WcStripeReconciliationStripe,
): LotusProductRef {
  if (tx.productId) {
    return {
      productKey: tx.productId,
      productCode: tx.productCode,
      productName: tx.productName ?? "Product",
    };
  }
  return {
    productKey: "unmapped",
    productCode: null,
    productName: "Unmapped",
  };
}

export function sortProductGroups<T extends { productKey: string; productCode: string | null; productName: string }>(
  groups: T[],
): T[] {
  return [...groups].sort((a, b) => {
    if (a.productKey === "unmapped") return 1;
    if (b.productKey === "unmapped") return -1;
    const codeA = a.productCode ?? "";
    const codeB = b.productCode ?? "";
    return codeA.localeCompare(codeB) || a.productName.localeCompare(b.productName);
  });
}
