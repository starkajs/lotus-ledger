import { isStripeRefundTransaction } from "~/lib/stripe-quickbooks.constants";
import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

export type QbPushedDocumentKind = "sales" | "refund";

export type QbPushedStripe = {
  id: string;
  stripeBalanceTransactionId: string;
  stripePaymentIntentId: string | null;
  /** Europe/London calendar date of the Stripe charge. */
  stripeDate: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  type: string;
  quickbooksSalesReceiptId: string | null;
  quickbooksRefundReceiptId: string | null;
  productCode: string | null;
  productName: string | null;
};

export type QbPushedReceipt = {
  id: string;
  kind: QbPushedDocumentKind;
  quickbooksId: string;
  docNumber: string | null;
  txnDate: string | null;
  trackingNum: string | null;
  customerName: string | null;
  totalAmt: string;
  totalTax: string | null;
  currencyCode: string | null;
};

export type QbPushedPair = {
  stripe: QbPushedStripe;
  receipt: QbPushedReceipt;
  amountMatches: boolean;
};

export type QbPushedDuplicate = {
  stripe: QbPushedStripe;
  receipts: QbPushedReceipt[];
};

export type QbPushedReconciliation = {
  matched: QbPushedPair[];
  duplicates: QbPushedDuplicate[];
  pushedReceiptOtherPeriod: QbPushedPair[];
  pushedMissing: QbPushedStripe[];
  receiptPushOtherPeriod: QbPushedPair[];
  qbNotPushed: QbPushedReceipt[];
  counts: {
    pushed: number;
    qbReceipts: number;
    matched: number;
    duplicates: number;
    duplicateReceipts: number;
    pushedReceiptOtherPeriod: number;
    pushedMissing: number;
    receiptPushOtherPeriod: number;
    qbNotPushed: number;
    amountMismatches: number;
  };
};

function inPeriod(date: string | null, dateFrom: string, dateTo: string): boolean {
  return date != null && date >= dateFrom && date <= dateTo;
}

function trackingKey(stripe: QbPushedStripe): string {
  return stripe.stripePaymentIntentId ?? stripe.stripeBalanceTransactionId;
}

function documentKind(stripe: QbPushedStripe): QbPushedDocumentKind {
  return isStripeRefundTransaction(stripe) ? "refund" : "sales";
}

function linkedQuickbooksId(stripe: QbPushedStripe): string | null {
  return documentKind(stripe) === "refund"
    ? stripe.quickbooksRefundReceiptId
    : stripe.quickbooksSalesReceiptId;
}

export function receiptsForPushedStripe(
  stripe: QbPushedStripe,
  receipts: QbPushedReceipt[],
): QbPushedReceipt[] {
  const kind = documentKind(stripe);
  const tracking = trackingKey(stripe);
  const linkedId = linkedQuickbooksId(stripe);
  return receipts
    .filter((receipt) => {
      if (receipt.kind !== kind) return false;
      if (linkedId && receipt.quickbooksId === linkedId) return true;
      return receipt.trackingNum != null && receipt.trackingNum === tracking;
    })
    .sort((a, b) => {
      const date = (a.txnDate ?? "").localeCompare(b.txnDate ?? "");
      if (date !== 0) return date;
      return (a.docNumber ?? "").localeCompare(b.docNumber ?? "");
    });
}

export function pushedAmountsMatch(
  stripe: QbPushedStripe,
  receipt: QbPushedReceipt,
): boolean {
  const currency = stripe.currency.toLowerCase();
  const qbCurrency = (receipt.currencyCode ?? currency).toLowerCase();
  if (currency !== qbCurrency) return false;
  const qbMinor = parseWooCommerceMoneyMinor(receipt.totalAmt, currency);
  if (qbMinor == null) return false;
  return stripe.amount === qbMinor;
}

function pair(stripe: QbPushedStripe, receipt: QbPushedReceipt): QbPushedPair {
  return {
    stripe,
    receipt,
    amountMatches: pushedAmountsMatch(stripe, receipt),
  };
}

export function classifyQbPushedReconciliation(input: {
  dateFrom: string;
  dateTo: string;
  pushed: QbPushedStripe[];
  receipts: QbPushedReceipt[];
}): QbPushedReconciliation {
  const { dateFrom, dateTo, receipts } = input;
  const pushedInPeriod = input.pushed.filter((stripe) =>
    inPeriod(stripe.stripeDate, dateFrom, dateTo),
  );
  const pushedOutside = input.pushed.filter(
    (stripe) => !inPeriod(stripe.stripeDate, dateFrom, dateTo),
  );

  const matched: QbPushedPair[] = [];
  const duplicates: QbPushedDuplicate[] = [];
  const pushedReceiptOtherPeriod: QbPushedPair[] = [];
  const pushedMissing: QbPushedStripe[] = [];
  const receiptPushOtherPeriod: QbPushedPair[] = [];
  const claimed = new Set<string>();

  function claim(list: QbPushedReceipt[]) {
    for (const receipt of list) claimed.add(receipt.id);
  }

  for (const stripe of pushedInPeriod) {
    const matches = receiptsForPushedStripe(stripe, receipts);
    if (matches.length > 1) {
      duplicates.push({ stripe, receipts: matches });
      claim(matches);
    } else if (matches.length === 1 && inPeriod(matches[0]!.txnDate, dateFrom, dateTo)) {
      matched.push(pair(stripe, matches[0]!));
      claim(matches);
    } else if (matches.length === 1) {
      pushedReceiptOtherPeriod.push(pair(stripe, matches[0]!));
      claim(matches);
    } else {
      pushedMissing.push(stripe);
    }
  }

  for (const stripe of pushedOutside) {
    const matches = receiptsForPushedStripe(stripe, receipts);
    const inPeriodMatches = matches.filter(
      (receipt) => inPeriod(receipt.txnDate, dateFrom, dateTo) && !claimed.has(receipt.id),
    );
    if (matches.length > 1 && inPeriodMatches.length > 0) {
      duplicates.push({ stripe, receipts: matches });
      claim(matches);
    }
  }

  const qbInPeriod = receipts.filter((receipt) =>
    inPeriod(receipt.txnDate, dateFrom, dateTo),
  );

  for (const receipt of qbInPeriod) {
    if (claimed.has(receipt.id)) continue;
    const stripe = pushedOutside.find((candidate) =>
      receiptsForPushedStripe(candidate, [receipt]).some((match) => match.id === receipt.id),
    );
    if (stripe) {
      receiptPushOtherPeriod.push(pair(stripe, receipt));
      claimed.add(receipt.id);
    }
  }

  const qbNotPushed = qbInPeriod.filter((receipt) => !claimed.has(receipt.id));

  return {
    matched,
    duplicates,
    pushedReceiptOtherPeriod,
    pushedMissing,
    receiptPushOtherPeriod,
    qbNotPushed,
    counts: {
      pushed: pushedInPeriod.length,
      qbReceipts: qbInPeriod.length,
      matched: matched.length,
      duplicates: duplicates.length,
      duplicateReceipts: duplicates.reduce((n, group) => n + group.receipts.length, 0),
      pushedReceiptOtherPeriod: pushedReceiptOtherPeriod.length,
      pushedMissing: pushedMissing.length,
      receiptPushOtherPeriod: receiptPushOtherPeriod.length,
      qbNotPushed: qbNotPushed.length,
      amountMismatches: matched.filter((row) => !row.amountMatches).length,
    },
  };
}
