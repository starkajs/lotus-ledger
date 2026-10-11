import { Link, useLocation } from "react-router";
import type { Route } from "./+types/reconciliations.qb-pushed";
import { AppPage } from "~/components/app-page";
import { QbPushedReconciliationPanels } from "~/components/qb-pushed-reconciliation-panels";
import {
  ReconciliationDateFilterForm,
  ReconciliationDateFilterSummary,
} from "~/components/reconciliation-date-filter-form";
import {
  hasReconciliationDateRange,
  parseReconciliationDateFiltersFromUrl,
  reconciliationHref,
} from "~/lib/reconciliation-date-filters";
import { loadQbPushedReconciliation } from "~/lib/qb-pushed-reconciliation.server";
import { requireUser } from "~/lib/session.server";

const PAGE_PATH = "/reconciliations/qb-pushed";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks ↔ pushed reconciliation — Lotus Ledger" },
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

  const data = await loadQbPushedReconciliation({
    dateFrom: dateFilters.dateFrom,
    dateTo: dateFilters.dateTo,
  });

  return {
    ...dateFilters,
    data,
    qbConnected: data != null,
  };
}

export default function QbPushedReconciliationPage({
  loaderData,
}: Route.ComponentProps) {
  const location = useLocation();
  const returnTo = location.pathname + location.search;
  const { dateFrom, dateTo, period, data, qbConnected } = loaderData;
  const hasRange = dateFrom != null && dateTo != null;

  return (
    <AppPage
      title="QuickBooks ↔ pushed"
      description="Compare QuickBooks receipts with the Stripe charges Lotus pushed to QuickBooks."
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
        </p>
      )}

      {!hasRange ? (
        <p className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-6 text-sm text-ink-muted sm:px-6">
          Choose a period or custom date range, then click{" "}
          <span className="text-dark">Run reconciliation</span> to load results.
          Pushed charges use the Stripe date. QuickBooks rows use the receipt
          date.
        </p>
      ) : data ? (
        <>
          <ReconciliationDateFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
          />

          <p className="mt-3 text-xs text-ink-muted">
            {data.counts.pushed} pushed charge
            {data.counts.pushed === 1 ? "" : "s"} · {data.counts.qbReceipts}{" "}
            QuickBooks receipt
            {data.counts.qbReceipts === 1 ? "" : "s"} · {data.counts.matched}{" "}
            matched · {data.counts.duplicates} duplicate
            {data.counts.duplicates === 1 ? "" : "s"} · {data.counts.qbNotPushed}{" "}
            not pushed by Lotus
            <span className="ml-2">
              <Link
                to={reconciliationHref(PAGE_PATH, { dateFrom, dateTo, period })}
                className="text-teal hover:underline"
              >
                Refresh
              </Link>
            </span>
          </p>

          <QbPushedReconciliationPanels data={data} returnTo={returnTo} />
        </>
      ) : null}
    </AppPage>
  );
}
