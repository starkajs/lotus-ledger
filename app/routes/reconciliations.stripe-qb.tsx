import { Link, useLocation } from "react-router";
import type { Route } from "./+types/reconciliations.stripe-qb";
import { AppPage } from "~/components/app-page";
import {
  ReconciliationDateFilterForm,
  ReconciliationDateFilterSummary,
} from "~/components/reconciliation-date-filter-form";
import { StripeQbReconciliationPanels } from "~/components/stripe-qb-reconciliation-panels";
import {
  hasReconciliationDateRange,
  parseReconciliationDateFiltersFromUrl,
  reconciliationHref,
} from "~/lib/reconciliation-date-filters";
import { requireUser } from "~/lib/session.server";
import { loadStripeQbReconciliation } from "~/lib/stripe-qb-reconciliation.server";

const PAGE_PATH = "/reconciliations/stripe-qb";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stripe ↔ QuickBooks reconciliation — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const dateFilters = parseReconciliationDateFiltersFromUrl(url.searchParams);

  if (!hasReconciliationDateRange(dateFilters)) {
    return {
      ...dateFilters,
      data: null as null,
      qbConnected: false,
    };
  }

  const data = await loadStripeQbReconciliation({
    dateFrom: dateFilters.dateFrom,
    dateTo: dateFilters.dateTo,
  });

  return {
    ...dateFilters,
    data,
    qbConnected: data != null,
  };
}

export default function StripeQbReconciliationPage({
  loaderData,
}: Route.ComponentProps) {
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  const { dateFrom, dateTo, period, data, qbConnected } = loaderData;
  const hasRange = dateFrom != null && dateTo != null;

  return (
    <AppPage
      title="Stripe ↔ QuickBooks"
      description="Reconcile synced Stripe balance transactions and QuickBooks sales receipts stored in Lotus Ledger."
      maxWidth="full"
      actions={
        <Link
          to="/reconciliations"
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          All reconciliations
        </Link>
      }
    >
      <ReconciliationDateFilterForm
        dateFrom={dateFrom}
        dateTo={dateTo}
        period={period}
        action={PAGE_PATH}
      />

      {!qbConnected && hasRange && (
        <p className="mt-4 text-sm text-maroon">
          Connect QuickBooks and sync sales receipts first.{" "}
          <Link to="/integrations/quickbooks" className="text-teal underline">
            QuickBooks settings
          </Link>
          {" · "}
          <Link
            to="/integrations/quickbooks/sales-receipts"
            className="text-teal underline"
          >
            Sales receipts
          </Link>
        </p>
      )}

      {!hasRange ? (
        <p className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-6 text-sm text-ink-muted sm:px-6">
          Choose a period or custom date range, then click{" "}
          <span className="text-dark">Run reconciliation</span> to load results.
          Stripe rows use the Stripe transaction date; QuickBooks rows use the
          receipt txn date.
        </p>
      ) : data ? (
        <>
          <ReconciliationDateFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
          />

          <p className="mt-3 text-xs text-ink-muted">
            {data.counts.stripeTransactions} Stripe transaction
            {data.counts.stripeTransactions === 1 ? "" : "s"} ·{" "}
            {data.counts.qbReceipts} QB sales receipt
            {data.counts.qbReceipts === 1 ? "" : "s"} (synced in Lotus) ·{" "}
            {data.counts.matched} matched · {data.counts.unmatchedStripe} Stripe
            unmatched · {data.counts.unmatchedQb} QB unmatched
            <span className="ml-2">
              <Link
                to={reconciliationHref(PAGE_PATH, { dateFrom, dateTo, period })}
                className="text-teal hover:underline"
              >
                Refresh
              </Link>
            </span>
          </p>

          <StripeQbReconciliationPanels
            matched={data.matched}
            unmatchedStripeByReason={data.unmatchedStripeByReason}
            unmatchedStripeByProduct={data.unmatchedStripeByProduct}
            unmatchedQbByCustomer={data.unmatchedQbByCustomer}
            amountMismatches={data.counts.amountMismatches}
            returnTo={returnTo}
          />
        </>
      ) : null}
    </AppPage>
  );
}
