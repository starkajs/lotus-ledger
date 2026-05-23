import {
  createQuickBooksSalesReceiptDetailed,
  type QuickBooksSalesReceiptCreateOutcome,
} from "~/lib/quickbooks-api-write.server";
import {
  planStripeQuickBooksPushForTransaction,
  type StripeQuickBooksPushPlan,
} from "~/lib/stripe-quickbooks-push-plan.server";
import {
  getQuickBooksSalesReceiptByQuickbooksId,
  upsertQuickBooksSalesReceiptFromApi,
} from "~/lib/quickbooks-sales-receipts.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { canPushTransactionToQuickbooks } from "~/lib/product-classification.server";
import type { StripeBalanceTransactionRecord } from "~/lib/stripe-balance-transactions.server";
import {
  clearStripeBalanceTransactionQuickBooksPush,
  getStripeBalanceTransactionById,
  setStripeBalanceTransactionQuickBooksSalesReceipt,
} from "~/lib/stripe-balance-transactions.server";

const BULK_PUSH_SKIP_SAMPLE_MAX = 30;
const BULK_PUSH_FAIL_SAMPLE_MAX = 20;

export type StripeQuickBooksBulkPushSkip = {
  stripeBalanceTransactionId: string;
  reason: string;
};

export type StripeQuickBooksBulkPushFailure = {
  stripeBalanceTransactionId: string;
  message: string;
};

export type StripeQuickBooksBulkPushResult = {
  matchedFilter: number;
  pushed: number;
  skipped: number;
  failed: number;
  skippedSample: StripeQuickBooksBulkPushSkip[];
  failedSample: StripeQuickBooksBulkPushFailure[];
};

export type StripeQuickBooksPushExecuteResult = {
  plan: StripeQuickBooksPushPlan;
  api: QuickBooksSalesReceiptCreateOutcome | null;
  salesReceiptId: string | null;
  /** Lotus `quickbooks_sales_receipts.id` when imported or already synced. */
  lotusSalesReceiptId: string | null;
};

export type ClearStripeQuickBooksPushResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function clearStripeTransactionQuickBooksPush(
  lotusTransactionId: string,
): Promise<ClearStripeQuickBooksPushResult> {
  return clearStripeBalanceTransactionQuickBooksPush(lotusTransactionId);
}

export async function pushStripeBalanceTransactionToQuickBooks(
  lotusTransactionId: string,
): Promise<StripeQuickBooksPushExecuteResult> {
  const tx = await getStripeBalanceTransactionById(lotusTransactionId);
  if (!tx) {
    return {
      plan: {
        salesReceipt: null,
        grossAmountMajor: null,
        lineAmountMajor: null,
        vatRatePercent: 0,
        currency: null,
        taxCodeId: null,
        taxCodeSource: null,
        issues: ["Transaction not found"],
        ready: false,
      },
      api: null,
      salesReceiptId: null,
      lotusSalesReceiptId: null,
    };
  }

  if (tx.quickbooksSalesReceiptId) {
    return {
      plan: await planStripeQuickBooksPushForTransaction({ transaction: tx }),
      api: {
        ok: false,
        message: `Already pushed (QuickBooks Sales Receipt ${tx.quickbooksSalesReceiptId})`,
        raw: { existingQuickbooksSalesReceiptId: tx.quickbooksSalesReceiptId },
      },
      salesReceiptId: tx.quickbooksSalesReceiptId,
      lotusSalesReceiptId: null,
    };
  }

  const plan = await planStripeQuickBooksPushForTransaction({ transaction: tx });
  if (!plan.ready || !plan.salesReceipt) {
    return { plan, api: null, salesReceiptId: null, lotusSalesReceiptId: null };
  }

  const api = await createQuickBooksSalesReceiptDetailed(plan.salesReceipt);
  if (!api.ok) {
    return { plan, api, salesReceiptId: null, lotusSalesReceiptId: null };
  }

  const salesReceiptId = api.salesReceipt.Id;
  const tokens = await getQuickBooksTokens();
  let lotusSalesReceiptId: string | null = null;

  if (tokens) {
    const existing = await getQuickBooksSalesReceiptByQuickbooksId(
      salesReceiptId,
      tokens.realmId,
    );
    if (existing) {
      lotusSalesReceiptId = existing.id;
    } else {
      const imported = await upsertQuickBooksSalesReceiptFromApi(api.salesReceipt);
      lotusSalesReceiptId = imported.id;
    }
  }

  await setStripeBalanceTransactionQuickBooksSalesReceipt(
    lotusTransactionId,
    salesReceiptId,
  );

  return { plan, api, salesReceiptId, lotusSalesReceiptId };
}

function recordSkip(
  result: StripeQuickBooksBulkPushResult,
  tx: Pick<StripeBalanceTransactionRecord, "stripeBalanceTransactionId">,
  reason: string,
) {
  result.skipped += 1;
  if (result.skippedSample.length < BULK_PUSH_SKIP_SAMPLE_MAX) {
    result.skippedSample.push({
      stripeBalanceTransactionId: tx.stripeBalanceTransactionId,
      reason,
    });
  }
}

function recordFailure(
  result: StripeQuickBooksBulkPushResult,
  tx: Pick<StripeBalanceTransactionRecord, "stripeBalanceTransactionId">,
  message: string,
) {
  result.failed += 1;
  if (result.failedSample.length < BULK_PUSH_FAIL_SAMPLE_MAX) {
    result.failedSample.push({
      stripeBalanceTransactionId: tx.stripeBalanceTransactionId,
      message,
    });
  }
}

/** Push each transaction; skip or fail individually without stopping the batch. */
export async function pushStripeBalanceTransactionsBulkToQuickBooks(
  transactions: StripeBalanceTransactionRecord[],
): Promise<StripeQuickBooksBulkPushResult> {
  const result: StripeQuickBooksBulkPushResult = {
    matchedFilter: transactions.length,
    pushed: 0,
    skipped: 0,
    failed: 0,
    skippedSample: [],
    failedSample: [],
  };

  for (const tx of transactions) {
    if (tx.quickbooksSalesReceiptId) {
      recordSkip(result, tx, "Already pushed to QuickBooks");
      continue;
    }

    const pushCheck = canPushTransactionToQuickbooks(tx);
    if (!pushCheck.ok) {
      recordSkip(result, tx, pushCheck.reason);
      continue;
    }

    const outcome = await pushStripeBalanceTransactionToQuickBooks(tx.id);

    if (outcome.api?.ok && outcome.salesReceiptId) {
      result.pushed += 1;
      continue;
    }

    if (!outcome.plan.ready) {
      const reason =
        outcome.plan.issues.length > 0
          ? outcome.plan.issues.join("; ")
          : "Not ready to push";
      recordSkip(result, tx, reason);
      continue;
    }

    if (outcome.api && !outcome.api.ok) {
      recordFailure(result, tx, outcome.api.message);
      continue;
    }

    recordSkip(result, tx, "Push did not complete");
  }

  return result;
}
