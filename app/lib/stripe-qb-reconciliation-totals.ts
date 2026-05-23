import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import type {
  StripeQbMatchedPair,
  StripeQbReconciliationByCustomer,
  StripeQbReconciliationReceipt,
  StripeQbReconciliationStripe,
} from "~/lib/stripe-qb-reconciliation.server";

export type CurrencyTotals = {
  currency: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
};

export type QbReceiptTotals = {
  currency: string;
  totalMinor: number;
  taxMinor: number;
};

export function sumStripeTransactions(
  transactions: StripeQbReconciliationStripe[],
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

export function sumQbReceipts(
  receipts: StripeQbReconciliationReceipt[],
): QbReceiptTotals[] {
  const byCurrency = new Map<string, QbReceiptTotals>();
  for (const receipt of receipts) {
    const currency = (receipt.currencyCode ?? "gbp").toLowerCase();
    const totalMinor =
      parseWooCommerceMoneyMinor(receipt.totalAmt, currency) ?? 0;
    const taxMinor =
      receipt.totalTax != null
        ? parseWooCommerceMoneyMinor(receipt.totalTax, currency) ?? 0
        : 0;
    const row = byCurrency.get(currency) ?? {
      currency,
      totalMinor: 0,
      taxMinor: 0,
    };
    row.totalMinor += totalMinor;
    row.taxMinor += taxMinor;
    byCurrency.set(currency, row);
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

export function sumMatchedStripeTotals(
  matched: StripeQbMatchedPair[],
): CurrencyTotals[] {
  return sumStripeTransactions(matched.map((p) => p.stripe));
}

export function sumMatchedQbTotals(
  matched: StripeQbMatchedPair[],
): QbReceiptTotals[] {
  return sumQbReceipts(matched.map((p) => p.receipt));
}

export type LotusProductRef = {
  productKey: string;
  productCode: string | null;
  productName: string;
};

export function productForStripeTx(
  tx: StripeQbReconciliationStripe,
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

export function productForMatchedPair(pair: StripeQbMatchedPair): LotusProductRef {
  return productForStripeTx(pair.stripe);
}

export function sortProductGroups<
  T extends { productKey: string; productCode: string | null; productName: string },
>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.productKey === "unmapped") return 1;
    if (b.productKey === "unmapped") return -1;
    const codeA = a.productCode ?? "";
    const codeB = b.productCode ?? "";
    return codeA.localeCompare(codeB) || a.productName.localeCompare(b.productName);
  });
}

export function sortCustomerGroups<
  T extends { customerKey: string; customerName: string },
>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.customerKey === "unknown") return 1;
    if (b.customerKey === "unknown") return -1;
    return a.customerName.localeCompare(b.customerName);
  });
}

export function stripeGrossMatchesQbTotal(
  stripe: StripeQbReconciliationStripe,
  receipt: StripeQbReconciliationReceipt,
): boolean {
  const currency = stripe.currency.toLowerCase();
  const qbCurrency = (receipt.currencyCode ?? currency).toLowerCase();
  if (currency !== qbCurrency) return false;
  const qbMinor = parseWooCommerceMoneyMinor(receipt.totalAmt, currency);
  if (qbMinor == null) return false;
  return stripe.amount === qbMinor;
}
