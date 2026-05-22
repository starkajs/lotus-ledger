import { Form, Link } from "react-router";
import type { Route } from "./+types/app.home";
import { AppPage } from "~/components/app-page";
import {
  getNetByProductDashboard,
  parseDashboardQueryParams,
  type DashboardCellAmount,
  type DashboardGranularity,
} from "~/lib/dashboard-net-by-product.server";
import { formatMoneyMinor } from "~/lib/money";
import { requireUser } from "~/lib/session.server";

const GRANULARITY_LABELS: Record<DashboardGranularity, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const GRANULARITY_HELP: Record<DashboardGranularity, string> = {
  daily: "One column per calendar day (UTC).",
  weekly: "One column per week (Monday–Sunday, UTC).",
  monthly: "One column per calendar month (UTC).",
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Home — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const params = parseDashboardQueryParams(url.searchParams);
  const dashboard = await getNetByProductDashboard(params);
  return { dashboard, params };
}

function formatCellAmounts(amounts: DashboardCellAmount[] | undefined) {
  if (!amounts?.length) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {amounts.map((a) => (
        <div key={a.currency} className="leading-snug">
          <span className="font-mono text-dark">
            {formatMoneyMinor(a.netMinor, a.currency)}
          </span>
          <span className="text-ink-faint"> ({a.count})</span>
        </div>
      ))}
    </div>
  );
}

export default function AppHome({ loaderData }: Route.ComponentProps) {
  const { dashboard, params } = loaderData;
  const { columns, buckets, cells, granularity, periods } = dashboard;

  const hasData = buckets.some((b) =>
    columns.some((c) => (cells[b.key]?.[c.periodStart]?.length ?? 0) > 0),
  );

  const periodUnit =
    granularity === "daily"
      ? periods === 1
        ? "day"
        : "days"
      : granularity === "weekly"
        ? periods === 1
          ? "week"
          : "weeks"
        : periods === 1
          ? "month"
          : "months";

  return (
    <AppPage
      title="Home"
      description="Net totals by product from synced Stripe balance transactions."
    >
      <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
        <div className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-medium text-dark">
            Net by product (last {periods} {periodUnit})
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            {GRANULARITY_HELP[granularity]} Each cell shows total net and
            transaction count.
          </p>

          <Form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Grouping</span>
              <select
                name="granularity"
                defaultValue={granularity}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                {(Object.keys(GRANULARITY_LABELS) as DashboardGranularity[]).map(
                  (g) => (
                    <option key={g} value={g}>
                      {GRANULARITY_LABELS[g]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Periods</span>
              <input
                name="periods"
                type="number"
                min={1}
                max={granularity === "daily" ? 90 : granularity === "weekly" ? 52 : 24}
                defaultValue={periods}
                className="w-20 rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-1.5 text-sm hover:bg-surface"
            >
              Apply
            </button>
          </Form>
        </div>

        {!hasData ? (
          <p className="px-4 py-8 text-sm text-ink-muted sm:px-6">
            No transactions in this period.{" "}
            <Link
              to="/integrations/stripe/transactions"
              className="text-teal hover:underline"
            >
              Sync from Stripe
            </Link>{" "}
            to populate the dashboard.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">
                    Product
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.periodStart}
                      className="min-w-[7.5rem] px-2 py-2 font-medium whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30">
                {buckets.map((bucket) => (
                  <tr key={bucket.key} className="hover:bg-sand/15">
                    <td className="sticky left-0 z-10 bg-surface-overlay px-3 py-2 font-medium text-dark whitespace-nowrap">
                      {bucket.label}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.periodStart}
                        className="px-2 py-2 align-top text-ink-muted"
                      >
                        {formatCellAmounts(
                          cells[bucket.key]?.[col.periodStart],
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-ink-faint">
        <Link
          to="/integrations/stripe/transactions"
          className="text-teal hover:underline"
        >
          View all transactions
        </Link>
        {" · "}
        <Link to="/products" className="text-teal hover:underline">
          Products
        </Link>
      </p>
    </AppPage>
  );
}
