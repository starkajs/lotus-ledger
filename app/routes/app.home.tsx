import { Link } from "react-router";
import type { Route } from "./+types/app.home";
import { AppPage } from "~/components/app-page";
import {
  getWeeklyNetByProductDashboard,
  type WeeklyCellAmount,
} from "~/lib/dashboard-weekly-by-product.server";
import { formatMoneyMinor } from "~/lib/money";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Home — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const weeklyByProduct = await getWeeklyNetByProductDashboard();
  return { weeklyByProduct };
}

function formatCellAmounts(amounts: WeeklyCellAmount[] | undefined) {
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
  const { weeklyByProduct } = loaderData;
  const { weeks, buckets, cells } = weeklyByProduct;
  const hasData = buckets.some((b) =>
    weeks.some((w) => (cells[b.key]?.[w.weekStart]?.length ?? 0) > 0),
  );

  return (
    <AppPage
      title="Home"
      description="Weekly net totals by product from synced Stripe balance transactions."
    >
      <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
        <div className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-medium text-dark">
            Net by product (last {weeks.length} weeks)
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Stripe transaction net (after fees), grouped by week starting Monday.
            Each cell shows total net and transaction count. Manual and matched
            products use their product code.
          </p>
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
                  {weeks.map((week) => (
                    <th
                      key={week.weekStart}
                      className="min-w-[7.5rem] px-2 py-2 font-medium whitespace-nowrap"
                    >
                      {week.label}
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
                    {weeks.map((week) => (
                      <td
                        key={week.weekStart}
                        className="px-2 py-2 align-top text-ink-muted"
                      >
                        {formatCellAmounts(cells[bucket.key]?.[week.weekStart])}
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
