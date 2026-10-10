import type { IntegrationAuditContext } from "~/lib/integration-jobs";
import {
  syncQuickBooksAccounts,
  syncQuickBooksClasses,
  syncQuickBooksItems,
  syncQuickBooksPaymentMethods,
  syncQuickBooksTaxCodes,
} from "~/lib/quickbooks-master-data.server";
import { syncQuickBooksRefundReceipts } from "~/lib/quickbooks-refund-receipts.server";
import { syncQuickBooksSalesReceipts } from "~/lib/quickbooks-sales-receipts.server";

export type QuickBooksRefreshAllStep = {
  key: string;
  label: string;
  ok: boolean;
  total: number | null;
  created: number | null;
  updated: number | null;
  tombstoned: number | null;
  error: string | null;
};

type SyncCounts = {
  total: number;
  created: number;
  updated: number;
  tombstoned?: number;
};

async function runStep(
  key: string,
  label: string,
  sync: () => Promise<SyncCounts>,
): Promise<QuickBooksRefreshAllStep> {
  try {
    const result = await sync();
    return {
      key,
      label,
      ok: true,
      total: result.total,
      created: result.created,
      updated: result.updated,
      tombstoned: result.tombstoned ?? null,
      error: null,
    };
  } catch (err) {
    return {
      key,
      label,
      ok: false,
      total: null,
      created: null,
      updated: null,
      tombstoned: null,
      error: err instanceof Error ? err.message : "Refresh failed",
    };
  }
}

/**
 * Pull every stored QuickBooks list in one pass. A failed list is reported
 * and the remaining lists still run. Each list keeps its own job-history row.
 */
export async function refreshAllQuickBooks(
  audit: IntegrationAuditContext,
): Promise<QuickBooksRefreshAllStep[]> {
  const steps: Array<[string, string, () => Promise<SyncCounts>]> = [
    ["accounts", "Chart of accounts", () => syncQuickBooksAccounts(audit)],
    ["classes", "Classes", () => syncQuickBooksClasses(audit)],
    ["tax-codes", "VAT codes", () => syncQuickBooksTaxCodes(audit)],
    ["items", "Products & services", () => syncQuickBooksItems(audit)],
    [
      "payment-methods",
      "Payment methods",
      () => syncQuickBooksPaymentMethods(audit),
    ],
    ["sales-receipts", "Sales receipts", () => syncQuickBooksSalesReceipts(audit)],
    [
      "refund-receipts",
      "Refund receipts",
      () => syncQuickBooksRefundReceipts(audit),
    ],
  ];

  const results: QuickBooksRefreshAllStep[] = [];
  for (const [key, label, sync] of steps) {
    results.push(await runStep(key, label, sync));
  }
  return results;
}
