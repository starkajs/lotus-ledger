/** Client-safe types and helpers for integration job runs (no DB). */

export const INTEGRATION_JOB_TYPES = [
  "stripe_transactions_sync",
  "stripe_transactions_classify",
  "woocommerce_orders_sync",
  "woocommerce_products_sync",
  "quickbooks_accounts_sync",
  "quickbooks_classes_sync",
  "quickbooks_items_sync",
  "quickbooks_tax_codes_sync",
  "quickbooks_payment_methods_sync",
  "quickbooks_sales_receipts_sync",
] as const;

export type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];

export type IntegrationJobTrigger = "app" | "cli";

export type IntegrationJobStatus = "running" | "completed" | "failed";

export const INTEGRATION_JOB_TYPE_LABELS: Record<IntegrationJobType, string> = {
  stripe_transactions_sync: "Stripe transactions sync",
  stripe_transactions_classify: "Stripe classification",
  woocommerce_orders_sync: "WooCommerce orders sync",
  woocommerce_products_sync: "WooCommerce products sync",
  quickbooks_accounts_sync: "QuickBooks accounts sync",
  quickbooks_classes_sync: "QuickBooks classes sync",
  quickbooks_items_sync: "QuickBooks items sync",
  quickbooks_tax_codes_sync: "QuickBooks tax codes sync",
  quickbooks_payment_methods_sync: "QuickBooks payment methods sync",
  quickbooks_sales_receipts_sync: "QuickBooks sales receipts sync",
};

export type IntegrationAuditContext = {
  triggeredBy: IntegrationJobTrigger;
  userId?: string | null;
};

export type ClassificationAuditContext = {
  triggeredBy: IntegrationJobTrigger | "sync";
  userId?: string | null;
  jobRunId?: string | null;
  action: "classify" | "manual_set";
};

export type IntegrationJobRunRecord = {
  id: string;
  jobType: IntegrationJobType;
  status: IntegrationJobStatus;
  triggeredBy: IntegrationJobTrigger;
  userId: string | null;
  userEmail: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  options: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
};

export function isIntegrationJobType(value: string): value is IntegrationJobType {
  return (INTEGRATION_JOB_TYPES as readonly string[]).includes(value);
}

export function formatJobDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export function summarizeJobResult(result: Record<string, unknown> | null): string {
  if (!result) return "—";
  const parts: string[] = [];
  for (const key of [
    "created",
    "updated",
    "processed",
    "matched",
    "unmatched",
    "ambiguous",
    "classified",
    "membersLinked",
    "total",
  ]) {
    const value = result[key];
    if (typeof value === "number") {
      parts.push(`${key} ${value}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "OK";
}
