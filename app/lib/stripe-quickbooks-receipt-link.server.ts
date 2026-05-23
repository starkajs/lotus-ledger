import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "~/db";
import {
  quickbooksSalesReceipts,
  stripeBalanceTransactions,
} from "~/db/schema";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  type IsoDateString,
} from "~/lib/date-range-filters";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { isStripeQuickbooksNa } from "~/lib/stripe-quickbooks.constants";

export type StripeReceiptMatchStripe = {
  id: string;
  stripePaymentIntentId: string | null;
  quickbooksSalesReceiptId: string | null;
  stripeCreatedAt: Date | string;
};

export type StripeReceiptMatchReceipt = {
  quickbooksId: string;
  trackingNum: string | null;
};

export function stripeTransactionMatchesQuickBooksReceipt(
  stripe: StripeReceiptMatchStripe,
  receipt: StripeReceiptMatchReceipt,
): boolean {
  if (
    stripe.quickbooksSalesReceiptId &&
    stripe.quickbooksSalesReceiptId === receipt.quickbooksId
  ) {
    return true;
  }
  if (
    stripe.stripePaymentIntentId &&
    receipt.trackingNum &&
    stripe.stripePaymentIntentId === receipt.trackingNum
  ) {
    return true;
  }
  return false;
}

export function findQuickBooksSalesReceiptForStripe<
  T extends StripeReceiptMatchReceipt,
>(
  stripe: StripeReceiptMatchStripe,
  byQuickbooksId: Map<string, T>,
  byTrackingNum: Map<string, T>,
): T | null {
  if (stripe.quickbooksSalesReceiptId) {
    const linked = byQuickbooksId.get(stripe.quickbooksSalesReceiptId);
    if (linked) return linked;
  }
  if (stripe.stripePaymentIntentId) {
    const linked = byTrackingNum.get(stripe.stripePaymentIntentId);
    if (linked) return linked;
  }
  return null;
}

/** Link Stripe row to QB Sales Receipt Id (respects NA before 1 Apr 2026). */
export async function linkStripeTransactionToQuickBooksSalesReceipt(
  lotusTransactionId: string,
  quickbooksSalesReceiptId: string,
  stripeCreatedAt: Date | string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const na = isStripeQuickbooksNa(stripeCreatedAt);

  await db
    .update(stripeBalanceTransactions)
    .set({
      quickbooksSalesReceiptId,
      ...(na
        ? {}
        : {
            pushedToQuickbooks: true,
            quickbooksPushedAt: now,
          }),
      updatedAt: now,
    })
    .where(eq(stripeBalanceTransactions.id, lotusTransactionId));
}

export type LinkStripeToSalesReceiptsResult = {
  stripeConsidered: number;
  linked: number;
  alreadyLinked: number;
  noMatch: number;
  skippedReceiptTaken: number;
};

export async function linkStripeTransactionsToQuickBooksSalesReceipts(input: {
  stripeSince: IsoDateString;
  stripeTo: IsoDateString;
  receiptSince: IsoDateString;
  receiptTo: IsoDateString;
}): Promise<LinkStripeToSalesReceiptsResult> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    throw new Error(
      "QuickBooks is not connected. Connect at /integrations/quickbooks first.",
    );
  }

  const db = getDb();
  const stripeRows = await db
    .select({
      id: stripeBalanceTransactions.id,
      stripePaymentIntentId: stripeBalanceTransactions.stripePaymentIntentId,
      quickbooksSalesReceiptId:
        stripeBalanceTransactions.quickbooksSalesReceiptId,
      stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
    })
    .from(stripeBalanceTransactions)
    .where(
      and(
        calendarDateCreatedGte(
          stripeBalanceTransactions.stripeCreatedAt,
          input.stripeSince,
        ),
        calendarDateCreatedLte(
          stripeBalanceTransactions.stripeCreatedAt,
          input.stripeTo,
        ),
      ),
    );

  const receiptRows = await db
    .select({
      quickbooksId: quickbooksSalesReceipts.quickbooksId,
      trackingNum: quickbooksSalesReceipts.trackingNum,
    })
    .from(quickbooksSalesReceipts)
    .where(
      and(
        eq(quickbooksSalesReceipts.realmId, tokens.realmId),
        eq(quickbooksSalesReceipts.qbStatus, "active"),
        gte(quickbooksSalesReceipts.txnDate, input.receiptSince),
        lte(quickbooksSalesReceipts.txnDate, input.receiptTo),
      ),
    );

  return linkStripeRowsToReceipts(stripeRows, receiptRows);
}

async function linkStripeRowsToReceipts(
  stripeRows: StripeReceiptMatchStripe[],
  receiptRows: StripeReceiptMatchReceipt[],
): Promise<LinkStripeToSalesReceiptsResult> {
  const db = getDb();
  const byQuickbooksId = new Map(
    receiptRows.map((r) => [r.quickbooksId, r] as const),
  );
  const byTrackingNum = new Map<string, StripeReceiptMatchReceipt>();
  for (const receipt of receiptRows) {
    if (receipt.trackingNum) {
      byTrackingNum.set(receipt.trackingNum, receipt);
    }
  }

  const allLinked = await db
    .select({
      id: stripeBalanceTransactions.id,
      quickbooksSalesReceiptId:
        stripeBalanceTransactions.quickbooksSalesReceiptId,
    })
    .from(stripeBalanceTransactions)
    .where(isNotNull(stripeBalanceTransactions.quickbooksSalesReceiptId));

  const qbIdToStripeId = new Map<string, string>();
  for (const row of allLinked) {
    if (row.quickbooksSalesReceiptId) {
      qbIdToStripeId.set(row.quickbooksSalesReceiptId, row.id);
    }
  }

  const result: LinkStripeToSalesReceiptsResult = {
    stripeConsidered: stripeRows.length,
    linked: 0,
    alreadyLinked: 0,
    noMatch: 0,
    skippedReceiptTaken: 0,
  };

  for (const stripe of stripeRows) {
    const receipt = findQuickBooksSalesReceiptForStripe(
      stripe,
      byQuickbooksId,
      byTrackingNum,
    );

    if (
      stripe.quickbooksSalesReceiptId &&
      receipt &&
      stripe.quickbooksSalesReceiptId === receipt.quickbooksId
    ) {
      result.alreadyLinked += 1;
      continue;
    }

    if (!receipt) {
      result.noMatch += 1;
      continue;
    }

    const takenBy = qbIdToStripeId.get(receipt.quickbooksId);
    if (takenBy && takenBy !== stripe.id) {
      result.skippedReceiptTaken += 1;
      continue;
    }

    await linkStripeTransactionToQuickBooksSalesReceipt(
      stripe.id,
      receipt.quickbooksId,
      stripe.stripeCreatedAt,
    );
    qbIdToStripeId.set(receipt.quickbooksId, stripe.id);
    result.linked += 1;
  }

  return result;
}
