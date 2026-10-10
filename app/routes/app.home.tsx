import { Form, Link } from "react-router";
import type { Route } from "./+types/app.home";
import { AppPage } from "~/components/app-page";
import {
  getNetByProductDashboard,
  parseDashboardQueryParams,
  type DashboardCellAmount,
  type DashboardGranularity,
} from "~/lib/dashboard-net-by-product.server";
import {
  formatJobDuration,
  HOME_SYNC_LABELS,
  summarizeJobResult,
} from "~/lib/integration-jobs";
import { listLatestHomeSyncs } from "~/lib/integration-jobs.server";
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
  const [dashboard, syncs] = await Promise.all([
    getNetByProductDashboard(params),
    listLatestHomeSyncs(),
  ]);
  return { dashboard, params, syncs };
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function syncStatusClass(status: string | null) {
  if (status === "completed") return "text-jade";
  if (status === "failed") return "text-maroon";
  return "text-ink-muted";
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
  const { dashboard, params, syncs } = loaderData;
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
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand-dark/40 px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-sm font-medium text-dark">Last syncs</h2>
            <p className="mt-1 text-xs text-ink-muted">
              The most recent run of each sync. The nightly job is the
              scheduled WooCommerce, Stripe, and QuickBooks pass.
            </p>
          </div>
          <Link
            to="/integrations/jobs"
            className="text-xs text-teal hover:underline"
          >
            Job history
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="bg-surface text-dark">
              <tr>
                <th className="px-3 py-2 font-medium">Sync</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-dark/30">
              {syncs.map((sync) => (
                <tr key={sync.jobType} className="hover:bg-sand/15">
                  <td className="px-3 py-2 font-medium text-dark">
                    {HOME_SYNC_LABELS[sync.jobType]}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                    {formatWhen(sync.finishedAt ?? sync.startedAt)}
                    {sync.durationMs != null ? (
                      <span className="text-ink-faint">
                        {" "}
                        · {formatJobDuration(sync.durationMs)}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-3 py-2 capitalize ${syncStatusClass(sync.status)}`}>
                    {sync.status ?? "Never"}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {sync.status === "failed" && sync.errorMessage
                      ? sync.errorMessage
                      : sync.status
                        ? summarizeJobResult(sync.result)
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
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
