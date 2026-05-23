import { Link, useLocation } from "react-router";
import type { Route } from "./+types/reconciliations.wc-stripe";
import { AppPage } from "~/components/app-page";
import {
  ReconciliationDateFilterForm,
  ReconciliationDateFilterSummary,
} from "~/components/reconciliation-date-filter-form";
import { WcStripeReconciliationPanels } from "~/components/wc-stripe-reconciliation-panels";
import {
  hasReconciliationDateRange,
  parseReconciliationDateFiltersFromUrl,
  reconciliationHref,
} from "~/lib/reconciliation-date-filters";
import { requireUser } from "~/lib/session.server";
import { loadWcStripeReconciliation } from "~/lib/wc-stripe-reconciliation.server";

const PAGE_PATH = "/reconciliations/wc-stripe";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WC ↔ Stripe reconciliation — Lotus Ledger" },
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
    };
  }

  const data = await loadWcStripeReconciliation({
    dateFrom: dateFilters.dateFrom,
    dateTo: dateFilters.dateTo,
  });

  return {
    ...dateFilters,
    data,
  };
}

export default function WcStripeReconciliationPage({
  loaderData,
}: Route.ComponentProps) {
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  const { dateFrom, dateTo, period, data } = loaderData;
  const hasRange = dateFrom != null && dateTo != null;

  return (
    <AppPage
      title="WooCommerce ↔ Stripe"
      description="Reconcile synced orders and balance transactions for a date range."
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

      {!hasRange ? (
        <p className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-6 text-sm text-ink-muted sm:px-6">
          Choose a period or custom date range, then click{" "}
          <span className="text-dark">Run reconciliation</span> to load results.
        </p>
      ) : (
        <>
          <ReconciliationDateFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
          />

          {data && (
            <p className="mt-3 text-xs text-ink-muted">
              {data.counts.wcOrders} WC order
              {data.counts.wcOrders === 1 ? "" : "s"} ·{" "}
              {data.counts.stripeTransactions} Stripe transaction
              {data.counts.stripeTransactions === 1 ? "" : "s"} ·{" "}
              {data.counts.matched} matched · {data.counts.unmatchedWc} WC
              unmatched · {data.counts.unmatchedStripe} Stripe unmatched
              <span className="ml-2">
                <Link
                  to={reconciliationHref(PAGE_PATH, { dateFrom, dateTo, period })}
                  className="text-teal hover:underline"
                >
                  Refresh
                </Link>
              </span>
            </p>
          )}

          {data && (
            <WcStripeReconciliationPanels
              matched={data.matched}
              unmatchedWcByStatus={data.unmatchedWcByStatus}
              unmatchedWcByProduct={data.unmatchedWcByProduct}
              unmatchedStripeByProduct={data.unmatchedStripeByProduct}
              returnTo={returnTo}
            />
          )}
        </>
      )}
    </AppPage>
  );
}
