import { Fragment } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.orders.summary";
import { AppPage } from "~/components/app-page";
import {
  WooCommerceOrdersFilterForm,
  WooCommerceOrdersFilterSummary,
} from "~/components/woocommerce-orders-filter-form";
import { resolveOrderDateFilters } from "~/lib/date-range-filters";
import {
  wooCommerceOrdersHref,
  type WooCommerceOrderListFilters,
} from "~/lib/woocommerce-orders-filters";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  aggregateWooCommerceOrdersByLotusAndLine,
  listDistinctWooCommerceOrderStatuses,
  type WooCommerceLotusProductAggregate,
} from "~/lib/woocommerce-orders.server";
import { requireUser } from "~/lib/session.server";

const ORDERS_PATH = "/integrations/woocommerce/orders";
const SUMMARY_PATH = "/integrations/woocommerce/orders/summary";

function lineProductLabel(line: {
  name: string;
  sku: string | null;
  wcProductId: number | null;
}): string {
  const parts = [line.name];
  if (line.sku) parts.push(`[${line.sku}]`);
  if (line.wcProductId != null && line.wcProductId > 0) {
    parts.push(`wc:${line.wcProductId}`);
  }
  return parts.join(" ");
}

function LotusGroupHeader({ group }: { group: WooCommerceLotusProductAggregate }) {
  if (group.unmapped) {
    return (
      <span className="font-medium text-dark">{group.name}</span>
    );
  }
  return (
    <Link
      to="/products"
      className="font-medium text-teal hover:underline"
      title={group.name}
    >
      <span className="font-mono text-[11px]">{group.code}</span>
      <span className="ml-1.5 text-dark">{group.name}</span>
    </Link>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WooCommerce sales by product — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status")?.trim() ?? "all";
  const { dateFrom, dateTo, period } = resolveOrderDateFilters({
    period: url.searchParams.get("period"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const lotusProductMissing = url.searchParams.get("lotusMissing") === "yes";

  const [aggregation, statuses] = await Promise.all([
    aggregateWooCommerceOrdersByLotusAndLine({
      status: statusRaw,
      dateFrom,
      dateTo,
      lotusProductMissing,
    }),
    listDistinctWooCommerceOrderStatuses(),
  ]);

  const status = statuses.includes(statusRaw) || statusRaw === "all"
    ? statusRaw
    : "all";

  return {
    ...aggregation,
    status,
    statuses,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  };
}

export default function WooCommerceOrdersSummaryPage({
  loaderData,
}: Route.ComponentProps) {
  const {
    configured,
    siteUrl,
    orderCount,
    groups,
    grandTotals,
    status,
    statuses,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  } = loaderData;

  const listFilters: WooCommerceOrderListFilters = {
    status,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  };

  const ordersListHref = wooCommerceOrdersHref(ORDERS_PATH, listFilters);

  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <AppPage
      title="Sales by product"
      description={
        configured && siteUrl
          ? `Line totals aggregated from WooCommerce orders (${siteUrl}).`
          : "Configure WC_* env vars to connect your shop."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to={ordersListHref}
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Order list
          </Link>
        </div>
      }
    >
      {!configured ? (
        <p className="text-sm text-maroon">
          WooCommerce is not configured. See{" "}
          <Link to="/integrations/woocommerce" className="text-teal underline">
            integration settings
          </Link>
          .
        </p>
      ) : (
        <>
          <nav className="mb-3 flex gap-3 text-xs" aria-label="Orders views">
            <Link
              to={ordersListHref}
              className="text-ink-muted hover:text-teal hover:underline"
            >
              Orders
            </Link>
            <span className="text-ink-faint" aria-hidden>
              /
            </span>
            <span className="font-medium text-dark">Sales by product</span>
          </nav>

          <WooCommerceOrdersFilterForm
            status={status}
            statuses={statuses}
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            lotusProductMissing={lotusProductMissing}
            action={SUMMARY_PATH}
          />
          <WooCommerceOrdersFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            lotusProductMissing={lotusProductMissing}
          />

          <p className="mt-3 text-xs text-ink-muted">
            {orderCount === 0
              ? "No orders in this period."
              : `${orderCount} order${orderCount === 1 ? "" : "s"} · ${lineCount} line${lineCount === 1 ? "" : "s"}`}
            {grandTotals.length > 0 && (
              <span className="text-ink-faint">
                {" "}
                · Total{" "}
                {grandTotals.map((t, i) => (
                  <Fragment key={t.currency}>
                    {i > 0 && ", "}
                    {formatWooCommerceMoneyMinor(t.amountMinor, t.currency)}
                  </Fragment>
                ))}
              </span>
            )}
          </p>

          {groups.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              No line items to aggregate for the selected filters.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map((group) => (
                <section
                  key={group.catalogProductId ?? "unmapped"}
                  className="overflow-x-auto rounded-jamyang border border-sand-dark/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-dark/40 bg-surface px-3 py-2">
                    <LotusGroupHeader group={group} />
                    <div className="flex flex-wrap gap-x-3 text-xs font-mono text-dark">
                      {group.subtotals.map((t) => (
                        <span key={t.currency}>
                          {formatWooCommerceMoneyMinor(t.amountMinor, t.currency)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <table className="w-full min-w-[32rem] text-left text-xs">
                    <thead className="bg-surface-overlay text-ink-muted">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Line product</th>
                        <th className="px-3 py-1.5 font-medium text-right">Qty</th>
                        <th className="px-3 py-1.5 font-medium">CCY</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface-overlay">
                      {group.lines.map((line) => (
                        <tr
                          key={`${line.wcProductId ?? 0}-${line.sku ?? ""}-${line.name}-${line.currency}`}
                          className="border-t border-sand-dark/30"
                        >
                          <td className="px-3 py-1.5 text-dark">
                            {lineProductLabel(line)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-ink-muted tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[10px] uppercase text-ink-muted">
                            {line.currency}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                            {formatWooCommerceMoneyMinor(
                              line.amountMinor,
                              line.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </AppPage>
  );
}
