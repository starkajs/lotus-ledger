import { max } from "drizzle-orm";
import { getDb } from "~/db";
import { stripeBalanceTransactions } from "~/db/schema";
import type { IntegrationAuditContext } from "~/lib/integration-jobs";
import {
  STRIPE_APP_SYNC_DAYS,
  STRIPE_SYNC_DAYS_MAX,
} from "~/lib/stripe-sync.constants";
import { syncStripeBalanceTransactions } from "~/lib/sync-stripe-transactions.server";

export type StripeRefreshAllStep = {
  key: string;
  label: string;
  ok: boolean;
  detail: string | null;
  error: string | null;
};

function daysAgoUtc(days: number): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.floor(days));
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

function formatSince(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

/** Last 30 days, or from the newest stored transaction when that is older. Capped at 90 days. */
async function stripeCatchUpSince(): Promise<Date> {
  const rolling = daysAgoUtc(STRIPE_APP_SYNC_DAYS);
  const floor = daysAgoUtc(STRIPE_SYNC_DAYS_MAX);
  const db = getDb();
  const [row] = await db
    .select({ value: max(stripeBalanceTransactions.stripeCreatedAt) })
    .from(stripeBalanceTransactions);
  const newest = row?.value ?? null;
  if (!newest || newest >= rolling) return rolling;
  return newest < floor ? floor : newest;
}

export async function refreshAllStripe(
  audit: IntegrationAuditContext,
): Promise<StripeRefreshAllStep[]> {
  try {
    const since = await stripeCatchUpSince();
    const result = await syncStripeBalanceTransactions({ since, audit });
    const accounts =
      result.connectionsProcessed === 1
        ? "1 account"
        : `${result.connectionsProcessed} accounts`;
    return [
      {
        key: "transactions",
        label: "Balance transactions",
        ok: true,
        detail: `${result.processed} from Stripe (${result.created} new, ${result.updated} updated) across ${accounts}, from ${formatSince(since)}`,
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
