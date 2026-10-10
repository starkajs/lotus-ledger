import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  quickbooksRefundReceipts,
  quickbooksSalesReceipts,
} from "~/db/schema";
import {
  createQuickBooksRefundReceiptDetailed,
  createQuickBooksSalesReceiptDetailed,
  quickBooksReceiptPresence,
  type QuickBooksRefundReceiptCreateOutcome,
  type QuickBooksSalesReceiptCreateOutcome,
} from "~/lib/quickbooks-api-write.server";
import {
  planStripeQuickBooksPushForTransaction,
  type StripeQuickBooksPushPlan,
} from "~/lib/stripe-quickbooks-push-plan.server";
import {
  getQuickBooksRefundReceiptByQuickbooksId,
  upsertQuickBooksRefundReceiptFromApi,
} from "~/lib/quickbooks-refund-receipts.server";
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
  setStripeBalanceTransactionQuickBooksRefundReceipt,
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

export type StripeQuickBooksPushApiOutcome =
  | QuickBooksSalesReceiptCreateOutcome
  | QuickBooksRefundReceiptCreateOutcome;

export type StripeQuickBooksPushExecuteResult = {
  plan: StripeQuickBooksPushPlan;
  api: StripeQuickBooksPushApiOutcome | null;
  salesReceiptId: string | null;
  refundReceiptId: string | null;
  /** Lotus `quickbooks_sales_receipts.id` when imported or already synced. */
  lotusSalesReceiptId: string | null;
  /** Lotus `quickbooks_refund_receipts.id` when imported or already synced. */
  lotusRefundReceiptId: string | null;
};

export type ClearStripeQuickBooksPushResult =
  | { ok: true }
  | { ok: false; reason: string };

const emptyPlan = (): StripeQuickBooksPushPlan => ({
  documentKind: "sales_receipt",
  salesReceipt: null,
  refundReceipt: null,
  grossAmountMajor: null,
  lineAmountMajor: null,
  vatRatePercent: 0,
  currency: null,
  taxCodeId: null,
  taxCodeSource: null,
  issues: ["Transaction not found"],
  ready: false,
});

function stripeQuickBooksDocumentAlreadyPushed(
  tx: Pick<
    StripeBalanceTransactionRecord,
    "quickbooksSalesReceiptId" | "quickbooksRefundReceiptId"
  >,
): string | null {
  return tx.quickbooksSalesReceiptId ?? tx.quickbooksRefundReceiptId ?? null;
}

async function tombstoneLocalQuickBooksReceipt(
  entity: "salesreceipt" | "refundreceipt",
  quickbooksId: string,
): Promise<void> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) return;
  const now = new Date();
  const table =
    entity === "salesreceipt" ? quickbooksSalesReceipts : quickbooksRefundReceipts;
  const db = getDb();
  await db
    .update(table)
    .set({
      qbStatus: "deleted_in_qb",
      deletedInQbAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(table.realmId, tokens.realmId), eq(table.quickbooksId, quickbooksId)),
    );
}

/**
 * Clear the Lotus push link only after QuickBooks reports each stored
 * receipt is gone. A receipt that still exists blocks the clear, so a
 * later push cannot create a second one by accident.
 */
export async function clearStripeTransactionQuickBooksPush(
  lotusTransactionId: string,
): Promise<ClearStripeQuickBooksPushResult> {
  const tx = await getStripeBalanceTransactionById(lotusTransactionId);
  if (!tx) return { ok: false, reason: "Transaction not found" };

  const receipts: Array<{
    entity: "salesreceipt" | "refundreceipt";
    id: string;
    label: string;
  }> = [];
  if (tx.quickbooksSalesReceiptId) {
    receipts.push({
      entity: "salesreceipt",
      id: tx.quickbooksSalesReceiptId,
      label: "Sales Receipt",
    });
  }
  if (tx.quickbooksRefundReceiptId) {
    receipts.push({
      entity: "refundreceipt",
      id: tx.quickbooksRefundReceiptId,
      label: "Refund Receipt",
    });
  }

  if (receipts.length === 0) {
    return {
      ok: false,
      reason: tx.pushedToQuickbooks
        ? "Lotus has no QuickBooks receipt id, so it cannot confirm the receipt was deleted."
        : "Transaction is not marked as pushed to QuickBooks",
    };
  }

  for (const receipt of receipts) {
    const presence = await quickBooksReceiptPresence(receipt);
    if (presence.state === "present") {
      return {
        ok: false,
        reason: `QuickBooks still has ${receipt.label} ${receipt.id}. Delete it in QuickBooks, then clear the flag.`,
      };
    }
    if (presence.state === "unknown") {
      return {
        ok: false,
        reason: `Could not confirm with QuickBooks that ${receipt.label} ${receipt.id} was deleted. ${presence.message}`,
      };
    }
  }

  const cleared = await clearStripeBalanceTransactionQuickBooksPush(
    lotusTransactionId,
  );
  if (!cleared.ok) return cleared;

  for (const receipt of receipts) {
    await tombstoneLocalQuickBooksReceipt(receipt.entity, receipt.id);
  }
  return cleared;
}

export async function pushStripeBalanceTransactionToQuickBooks(
  lotusTransactionId: string,
): Promise<StripeQuickBooksPushExecuteResult> {
  const tx = await getStripeBalanceTransactionById(lotusTransactionId);
  if (!tx) {
    return {
      plan: emptyPlan(),
      api: null,
      salesReceiptId: null,
      refundReceiptId: null,
      lotusSalesReceiptId: null,
      lotusRefundReceiptId: null,
    };
  }

  const existingDocumentId = stripeQuickBooksDocumentAlreadyPushed(tx);
  if (existingDocumentId) {
    const documentLabel = tx.quickbooksRefundReceiptId
      ? "Refund Receipt"
      : "Sales Receipt";
    return {
      plan: await planStripeQuickBooksPushForTransaction({ transaction: tx }),
      api: {
        ok: false,
        message: `Already pushed (QuickBooks ${documentLabel} ${existingDocumentId})`,
        raw: {
          existingQuickbooksSalesReceiptId: tx.quickbooksSalesReceiptId,
          existingQuickbooksRefundReceiptId: tx.quickbooksRefundReceiptId,
        },
      },
      salesReceiptId: tx.quickbooksSalesReceiptId,
      refundReceiptId: tx.quickbooksRefundReceiptId,
      lotusSalesReceiptId: null,
      lotusRefundReceiptId: null,
    };
  }

  const plan = await planStripeQuickBooksPushForTransaction({ transaction: tx });
  const hasPayload =
    plan.documentKind === "refund_receipt"
      ? Boolean(plan.refundReceipt)
      : Boolean(plan.salesReceipt);
  if (!plan.ready || !hasPayload) {
    return {
      plan,
      api: null,
      salesReceiptId: null,
      refundReceiptId: null,
      lotusSalesReceiptId: null,
      lotusRefundReceiptId: null,
    };
  }

  if (plan.documentKind === "refund_receipt" && plan.refundReceipt) {
    const api = await createQuickBooksRefundReceiptDetailed(plan.refundReceipt);
    if (!api.ok) {
      return {
        plan,
        api,
        salesReceiptId: null,
        refundReceiptId: null,
        lotusSalesReceiptId: null,
        lotusRefundReceiptId: null,
      };
    }

    const refundReceiptId = api.refundReceipt.Id;
    const tokens = await getQuickBooksTokens();
    let lotusRefundReceiptId: string | null = null;

    if (tokens) {
      const existing = await getQuickBooksRefundReceiptByQuickbooksId(
        refundReceiptId,
        tokens.realmId,
      );
      if (existing) {
        lotusRefundReceiptId = existing.id;
      } else {
        const imported = await upsertQuickBooksRefundReceiptFromApi(
          api.refundReceipt,
        );
        lotusRefundReceiptId = imported.id;
      }
    }

    await setStripeBalanceTransactionQuickBooksRefundReceipt(
      lotusTransactionId,
      refundReceiptId,
    );

    return {
      plan,
      api,
      salesReceiptId: null,
      refundReceiptId,
      lotusSalesReceiptId: null,
      lotusRefundReceiptId,
    };
  }

  const api = await createQuickBooksSalesReceiptDetailed(plan.salesReceipt!);
  if (!api.ok) {
    return {
      plan,
      api,
      salesReceiptId: null,
      refundReceiptId: null,
      lotusSalesReceiptId: null,
      lotusRefundReceiptId: null,
    };
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

  return {
    plan,
    api,
    salesReceiptId,
    refundReceiptId: null,
    lotusSalesReceiptId,
    lotusRefundReceiptId: null,
  };
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
    if (stripeQuickBooksDocumentAlreadyPushed(tx)) {
      recordSkip(result, tx, "Already pushed to QuickBooks");
      continue;
    }

    const pushCheck = canPushTransactionToQuickbooks(tx);
    if (!pushCheck.ok) {
      recordSkip(result, tx, pushCheck.reason);
      continue;
    }

    const outcome = await pushStripeBalanceTransactionToQuickBooks(tx.id);

    if (
      outcome.api?.ok &&
      (outcome.salesReceiptId || outcome.refundReceiptId)
    ) {
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
