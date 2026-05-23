import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "~/db";
import {
  products,
  quickbooksSalesReceipts,
  stripeBalanceTransactions,
} from "~/db/schema";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  type IsoDateString,
} from "~/lib/date-range-filters";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import {
  findQuickBooksSalesReceiptForStripe,
  stripeTransactionMatchesQuickBooksReceipt,
} from "~/lib/stripe-quickbooks-receipt-link.server";
import {
  productForStripeTx,
  sortCustomerGroups,
  sortProductGroups,
  stripeGrossMatchesQbTotal,
  sumQbReceipts,
  sumStripeTransactions,
  type QbReceiptTotals,
  type CurrencyTotals,
} from "~/lib/stripe-qb-reconciliation-totals";

export { stripeTransactionMatchesQuickBooksReceipt };

export type StripeQbReconciliationStripe = {
  id: string;
  stripeBalanceTransactionId: string;
  stripePaymentIntentId: string | null;
  stripeCreatedAt: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  pushedToQuickbooks: boolean | null;
  quickbooksSalesReceiptId: string | null;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

export type StripeQbReconciliationReceipt = {
  id: string;
  quickbooksId: string;
  docNumber: string | null;
  txnDate: string | null;
  trackingNum: string | null;
  customerName: string | null;
  totalAmt: string;
  totalTax: string | null;
  currencyCode: string | null;
  privateNote: string | null;
};

export type StripeQbMatchedPair = {
  stripe: StripeQbReconciliationStripe;
  receipt: StripeQbReconciliationReceipt;
  amountMatches: boolean;
};

export type StripeQbUnmatchedStripeReason =
  | "na"
  | "not_pushed"
  | "pushed_no_synced_receipt"
  | "no_qb_link";

export type StripeQbReconciliationStripeByReason = {
  reason: StripeQbUnmatchedStripeReason;
  reasonLabel: string;
  transactions: StripeQbReconciliationStripe[];
  stripeTotals: CurrencyTotals[];
};

export type StripeQbReconciliationStripeByProduct = {
  productKey: string;
  productCode: string | null;
  productName: string;
  transactions: StripeQbReconciliationStripe[];
  stripeTotals: CurrencyTotals[];
};

export type StripeQbReconciliationByCustomer = {
  customerKey: string;
  customerName: string;
  receipts: StripeQbReconciliationReceipt[];
  qbTotals: QbReceiptTotals[];
};

export type StripeQbReconciliationData = {
  matched: StripeQbMatchedPair[];
  unmatchedStripeByReason: StripeQbReconciliationStripeByReason[];
  unmatchedStripeByProduct: StripeQbReconciliationStripeByProduct[];
  unmatchedQbByCustomer: StripeQbReconciliationByCustomer[];
  counts: {
    stripeTransactions: number;
    qbReceipts: number;
    matched: number;
    unmatchedStripe: number;
    unmatchedQb: number;
    amountMismatches: number;
  };
};

const UNMATCHED_STRIPE_REASON_LABELS: Record<
  StripeQbUnmatchedStripeReason,
  string
> = {
  na: "Not applicable (before 1 Apr 2026)",
  not_pushed: "Not pushed to QuickBooks",
  pushed_no_synced_receipt:
    "Marked pushed but sales receipt not in Lotus Ledger",
  no_qb_link: "No QuickBooks link in this period",
};

function stripeDateWhere(dateFrom: IsoDateString, dateTo: IsoDateString) {
  return and(
    calendarDateCreatedGte(stripeBalanceTransactions.stripeCreatedAt, dateFrom),
    calendarDateCreatedLte(stripeBalanceTransactions.stripeCreatedAt, dateTo),
  );
}

function qbDateWhere(
  realmId: string,
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
) {
  return and(
    eq(quickbooksSalesReceipts.realmId, realmId),
    eq(quickbooksSalesReceipts.qbStatus, "active"),
    gte(quickbooksSalesReceipts.txnDate, dateFrom),
    lte(quickbooksSalesReceipts.txnDate, dateTo),
  );
}

async function loadStripeInRange(
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
): Promise<StripeQbReconciliationStripe[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.id,
      stripeBalanceTransactionId:
        stripeBalanceTransactions.stripeBalanceTransactionId,
      stripePaymentIntentId: stripeBalanceTransactions.stripePaymentIntentId,
      stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      amount: stripeBalanceTransactions.amount,
      fee: stripeBalanceTransactions.fee,
      net: stripeBalanceTransactions.net,
      currency: stripeBalanceTransactions.currency,
      pushedToQuickbooks: stripeBalanceTransactions.pushedToQuickbooks,
      quickbooksSalesReceiptId:
        stripeBalanceTransactions.quickbooksSalesReceiptId,
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
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeCreatedAt: row.stripeCreatedAt.toISOString(),
    amount: row.amount,
    fee: row.fee,
    net: row.net,
    currency: row.currency,
    pushedToQuickbooks: row.pushedToQuickbooks,
    quickbooksSalesReceiptId: row.quickbooksSalesReceiptId,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
  }));
}

async function loadReceiptsInRange(
  realmId: string,
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
): Promise<StripeQbReconciliationReceipt[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: quickbooksSalesReceipts.id,
      quickbooksId: quickbooksSalesReceipts.quickbooksId,
      docNumber: quickbooksSalesReceipts.docNumber,
      txnDate: quickbooksSalesReceipts.txnDate,
      trackingNum: quickbooksSalesReceipts.trackingNum,
      customerName: quickbooksSalesReceipts.customerName,
      totalAmt: quickbooksSalesReceipts.totalAmt,
      totalTax: quickbooksSalesReceipts.totalTax,
      currencyCode: quickbooksSalesReceipts.currencyCode,
      privateNote: quickbooksSalesReceipts.privateNote,
    })
    .from(quickbooksSalesReceipts)
    .where(qbDateWhere(realmId, dateFrom, dateTo))
    .orderBy(
      desc(quickbooksSalesReceipts.txnDate),
      desc(quickbooksSalesReceipts.docNumber),
    );

  return rows.map((row) => ({
    id: row.id,
    quickbooksId: row.quickbooksId,
    docNumber: row.docNumber,
    txnDate: row.txnDate,
    trackingNum: row.trackingNum,
    customerName: row.customerName,
    totalAmt: row.totalAmt,
    totalTax: row.totalTax,
    currencyCode: row.currencyCode,
    privateNote: row.privateNote,
  }));
}

function unmatchedStripeReason(
  stripe: StripeQbReconciliationStripe,
  receiptsByQuickbooksId: Map<string, StripeQbReconciliationReceipt>,
): StripeQbUnmatchedStripeReason {
  if (stripe.pushedToQuickbooks === null) return "na";
  if (!stripe.pushedToQuickbooks && !stripe.quickbooksSalesReceiptId) {
    return "not_pushed";
  }
  if (
    stripe.quickbooksSalesReceiptId &&
    !receiptsByQuickbooksId.has(stripe.quickbooksSalesReceiptId)
  ) {
    return "pushed_no_synced_receipt";
  }
  return "no_qb_link";
}

function groupUnmatchedStripeByReason(
  transactions: StripeQbReconciliationStripe[],
  receiptsByQuickbooksId: Map<string, StripeQbReconciliationReceipt>,
): StripeQbReconciliationStripeByReason[] {
  const byReason = new Map<
    StripeQbUnmatchedStripeReason,
    StripeQbReconciliationStripe[]
  >();
  for (const tx of transactions) {
    const reason = unmatchedStripeReason(tx, receiptsByQuickbooksId);
    const list = byReason.get(reason) ?? [];
    list.push(tx);
    byReason.set(reason, list);
  }
  const order: StripeQbUnmatchedStripeReason[] = [
    "not_pushed",
    "no_qb_link",
    "pushed_no_synced_receipt",
    "na",
  ];
  return order
    .filter((r) => byReason.has(r))
    .map((reason) => {
      const txs = byReason.get(reason)!;
      return {
        reason,
        reasonLabel: UNMATCHED_STRIPE_REASON_LABELS[reason],
        transactions: txs,
        stripeTotals: sumStripeTransactions(txs),
      };
    });
}

function groupUnmatchedStripeByProduct(
  transactions: StripeQbReconciliationStripe[],
): StripeQbReconciliationStripeByProduct[] {
  const byProduct = new Map<string, StripeQbReconciliationStripeByProduct>();
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

function groupUnmatchedQbByCustomer(
  receipts: StripeQbReconciliationReceipt[],
): StripeQbReconciliationByCustomer[] {
  const byCustomer = new Map<string, StripeQbReconciliationByCustomer>();
  for (const receipt of receipts) {
    const customerKey = receipt.customerName?.trim() || "unknown";
    const customerName = receipt.customerName?.trim() || "Unknown customer";
    let group = byCustomer.get(customerKey);
    if (!group) {
      group = {
        customerKey,
        customerName,
        receipts: [],
        qbTotals: [],
      };
      byCustomer.set(customerKey, group);
    }
    group.receipts.push(receipt);
  }
  for (const group of byCustomer.values()) {
    group.qbTotals = sumQbReceipts(group.receipts);
  }
  return sortCustomerGroups([...byCustomer.values()]);
}

export async function loadStripeQbReconciliation(input: {
  dateFrom: IsoDateString;
  dateTo: IsoDateString;
}): Promise<StripeQbReconciliationData | null> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    return null;
  }

  const [stripeTransactions, receipts] = await Promise.all([
    loadStripeInRange(input.dateFrom, input.dateTo),
    loadReceiptsInRange(tokens.realmId, input.dateFrom, input.dateTo),
  ]);

  const byQuickbooksId = new Map(
    receipts.map((r) => [r.quickbooksId, r] as const),
  );
  const byTrackingNum = new Map<string, StripeQbReconciliationReceipt>();
  for (const receipt of receipts) {
    if (receipt.trackingNum) {
      byTrackingNum.set(receipt.trackingNum, receipt);
    }
  }

  const matched: StripeQbMatchedPair[] = [];
  const unmatchedStripe: StripeQbReconciliationStripe[] = [];
  const matchedReceiptIds = new Set<string>();

  for (const stripe of stripeTransactions) {
    const receipt = findQuickBooksSalesReceiptForStripe(
      stripe,
      byQuickbooksId,
      byTrackingNum,
    );
    if (receipt) {
      matched.push({
        stripe,
        receipt,
        amountMatches: stripeGrossMatchesQbTotal(stripe, receipt),
      });
      matchedReceiptIds.add(receipt.id);
    } else {
      unmatchedStripe.push(stripe);
    }
  }

  const unmatchedQb = receipts.filter((r) => !matchedReceiptIds.has(r.id));

  return {
    matched,
    unmatchedStripeByReason: groupUnmatchedStripeByReason(
      unmatchedStripe,
      byQuickbooksId,
    ),
    unmatchedStripeByProduct: groupUnmatchedStripeByProduct(unmatchedStripe),
    unmatchedQbByCustomer: groupUnmatchedQbByCustomer(unmatchedQb),
    counts: {
      stripeTransactions: stripeTransactions.length,
      qbReceipts: receipts.length,
      matched: matched.length,
      unmatchedStripe: unmatchedStripe.length,
      unmatchedQb: unmatchedQb.length,
      amountMismatches: matched.filter((p) => !p.amountMatches).length,
    },
  };
}
