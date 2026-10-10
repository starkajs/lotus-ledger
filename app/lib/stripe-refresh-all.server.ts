import type { IntegrationAuditContext } from "~/lib/integration-jobs";
import { syncStripeBalanceTransactions } from "~/lib/sync-stripe-transactions.server";

export type StripeRefreshAllStep = {
  key: string;
  label: string;
  ok: boolean;
  detail: string | null;
  error: string | null;
};

function formatSince(iso: string | undefined): string {
  if (!iso) return "the usual window";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export async function refreshAllStripe(
  audit: IntegrationAuditContext,
): Promise<StripeRefreshAllStep[]> {
  try {
    const result = await syncStripeBalanceTransactions({ audit });
    const accounts =
      result.connectionsProcessed === 1
        ? "1 account"
        : `${result.connectionsProcessed} accounts`;
    return [
      {
        key: "transactions",
        label: "Balance transactions",
        ok: true,
        detail: `${result.processed} from Stripe (${result.created} new, ${result.updated} updated) across ${accounts}, from ${formatSince(result.createdGte)}`,
        error: null,
      },
    ];
  } catch (err) {
    return [
      {
        key: "transactions",
        label: "Balance transactions",
        ok: false,
        detail: null,
        error: err instanceof Error ? err.message : "Refresh failed",
      },
    ];
  }
}
