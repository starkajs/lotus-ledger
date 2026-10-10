import { updateQuickBooksReceiptDescription } from "~/lib/quickbooks-api-write.server";
import { upsertQuickBooksRefundReceiptFromApi } from "~/lib/quickbooks-refund-receipts.server";
import { upsertQuickBooksSalesReceiptFromApi } from "~/lib/quickbooks-sales-receipts.server";
import { planStripeQuickBooksPushForTransaction } from "~/lib/stripe-quickbooks-push-plan.server";
import { getStripeBalanceTransactionById } from "~/lib/stripe-balance-transactions.server";

export type UpdateQuickBooksDescriptionResult =
  | {
      ok: true;
      description: string;
      documentId: string;
      kind: "sales_receipt" | "refund_receipt";
    }
  | { ok: false; message: string };

/**
 * Rewrite the description on the QuickBooks receipt already linked to this
 * Stripe transaction. Does not create a second receipt.
 */
export async function updateStripeTransactionQuickBooksDescription(
  lotusTransactionId: string,
): Promise<UpdateQuickBooksDescriptionResult> {
  const tx = await getStripeBalanceTransactionById(lotusTransactionId);
  if (!tx) return { ok: false, message: "Transaction not found" };

  const refund = Boolean(tx.quickbooksRefundReceiptId);
  const documentId = refund
    ? tx.quickbooksRefundReceiptId
    : tx.quickbooksSalesReceiptId;
  if (!documentId) {
    return {
      ok: false,
      message: "This transaction has not been pushed to QuickBooks",
    };
  }

  const plan = await planStripeQuickBooksPushForTransaction({ transaction: tx });
  const description = refund
    ? plan.refundReceipt?.Line[0]?.Description
    : plan.salesReceipt?.Line[0]?.Description;
  if (!description?.trim()) {
    return { ok: false, message: "Could not build a QuickBooks description" };
  }

  const updated = await updateQuickBooksReceiptDescription({
    entity: refund ? "refundreceipt" : "salesreceipt",
    id: documentId,
    description,
  });
  if (!updated.ok) return { ok: false, message: updated.message };

  if (refund) {
    await upsertQuickBooksRefundReceiptFromApi(updated.receipt);
  } else {
    await upsertQuickBooksSalesReceiptFromApi(updated.receipt);
  }

  return {
    ok: true,
    description,
    documentId,
    kind: refund ? "refund_receipt" : "sales_receipt",
  };
}
