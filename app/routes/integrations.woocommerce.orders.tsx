import { Fragment } from "react";
import { Form, Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.orders";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  DATE_PERIOD_LABELS,
  DATE_PERIOD_PRESETS,
  resolveOrderDateFilters,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";
import {
  listDistinctWooCommerceOrderStatuses,
  listWooCommerceOrdersFromDb,
  type WooCommerceOrderRecord,
} from "~/lib/woocommerce-orders.server";
import { syncWooCommerceOrders } from "~/lib/sync-woocommerce-orders.server";
import { requireUser } from "~/lib/session.server";

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

type OrderListFilters = {
  status: string;
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
};

function appendDateFilters(params: URLSearchParams, filters: OrderListFilters) {
  if (filters.period) {
    params.set("period", filters.period);
  } else {
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
  }
}

function pageHref(page: number, filters: OrderListFilters) {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  appendDateFilters(params, filters);
  if (filters.lotusProductMissing) params.set("lotusMissing", "yes");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function orderDetailHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/orders/${orderId}?${params}`;
}

function StatusBadge({ status }: { status: string }) {
  const completed = status === "completed";
  return (
    <span
      className={
        completed
          ? "inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium capitalize text-jade"
          : "inline-flex rounded bg-sand/80 px-1.5 py-0.5 text-[10px] font-medium capitalize text-ink-muted"
      }
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}

function LotusProductsCell({ order }: { order: WooCommerceOrderRecord }) {
  if (order.lotusProducts.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-1 gap-y-0.5">
      {order.lotusProducts.map((product, index) => (
        <Fragment key={product.catalogProductId}>
          {index > 0 && <span className="text-ink-faint">,</span>}
          <Link
            to="/products"
            className="font-mono text-[10px] text-teal hover:underline"
            title={
              product.source === "manual"
                ? `${product.name} (manual assignment)`
                : product.name
            }
          >
            {product.code}
            {product.source === "manual" ? (
              <span className="text-ink-faint">*</span>
            ) : null}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}

function OrderLinesRow({ order }: { order: WooCommerceOrderRecord }) {
  const items = order.lineItems;
  if (items.length === 0) {
    if (!order.lineSummary) return null;
    return (
      <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
        <td className="px-2 pb-1.5 pt-0" />
        <td colSpan={8} className="px-2 pb-2 pt-0 text-[10px] text-ink-muted">
          <span className="text-ink-faint">Lines: </span>
          {order.lineSummary}
        </td>
      </tr>
    );
  }

  const visible = items.slice(0, 4);
  const more = items.length - visible.length;

  return (
    <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
      <td className="px-2 pb-1.5 pt-0" />
      <td colSpan={8} className="px-2 pb-2 pt-0 text-[10px] text-ink-muted">
        <span className="text-ink-faint">Lines: </span>
        {visible.map((item, index) => (
          <span key={item.id}>
            {index > 0 && ", "}
            {item.quantity > 1 ? `${item.quantity}× ` : ""}
            {item.name}
            {item.sku ? (
              <span className="font-mono text-ink-faint" title="SKU">
                {" "}
                [{item.sku}]
              </span>
            ) : null}
          </span>
        ))}
        {more > 0 && (
          <span className="text-ink-faint">{` (+${more} more)`}</span>
        )}
      </td>
    </tr>
  );
}

function MemberCell({ order }: { order: WooCommerceOrderRecord }) {
  if (order.communityMemberId) {
    return (
      <Link
        to={`/community/${order.communityMemberId}`}
        className="text-teal hover:underline"
      >
        {order.memberName ?? order.memberEmail ?? "Member"}
      </Link>
    );
  }
  if (order.billingEmail) {
    return (
      <Link
        to={`/community?q=${encodeURIComponent(order.billingEmail)}`}
        className="text-ink-muted hover:text-teal hover:underline"
      >
        {order.billingEmail}
      </Link>
    );
  }
  return <span className="text-ink-faint">—</span>;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WooCommerce orders — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const statusRaw = url.searchParams.get("status")?.trim() ?? "all";
  const { dateFrom, dateTo, period } = resolveOrderDateFilters({
    period: url.searchParams.get("period"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const lotusProductMissing = url.searchParams.get("lotusMissing") === "yes";

  const [list, statuses] = await Promise.all([
    listWooCommerceOrdersFromDb({
      page,
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
    ...list,
    status,
    statuses,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "sync") {
    return { scope: "sync" as const, error: "Unknown action" };
  }
  try {
    const result = await syncWooCommerceOrders();
    return { scope: "sync" as const, success: true as const, result };
  } catch (err) {
    return {
      scope: "sync" as const,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

export default function WooCommerceOrdersPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const returnTo = location.pathname + location.search;
  const {
    configured,
    siteUrl,
    orders,
    total,
    page,
    pageSize,
    totalPages,
    lastSyncedAt,
    status,
    statuses,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  } = loaderData;

  const listFilters: OrderListFilters = {
    status,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
  };

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <AppPage
      title="WooCommerce orders"
      description={
        configured && siteUrl
          ? `Synced from ${siteUrl}. Last sync: ${formatSyncedAt(lastSyncedAt)}.`
          : "Configure WC_* env vars to connect your shop."
      }
      actions={
        configured ? (
          <Form method="post" action={postAction}>
            <SubmitButton intent="sync" variant="pill" loadingLabel="Syncing…">
              Sync from WooCommerce
            </SubmitButton>
          </Form>
        ) : (
          <Link
            to="/integrations/woocommerce"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Setup
          </Link>
        )
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
          {syncError && (
            <p className="mb-3 text-sm text-maroon" role="alert">
              {syncError}
            </p>
          )}
          {syncResult && (
            <p className="mb-3 text-sm text-jade">
              Sync complete: {syncResult.created} created, {syncResult.updated}{" "}
              updated, {syncResult.membersLinked} linked to community members.
            </p>
          )}

          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Period</span>
              <select
                name="period"
                defaultValue={period ?? ""}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[10rem]"
              >
                <option value="">Custom range</option>
                {DATE_PERIOD_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {DATE_PERIOD_LABELS[preset]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Date from</span>
              <input
                type="date"
                name="from"
                defaultValue={dateFrom ?? ""}
                disabled={period != null}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Date to</span>
              <input
                type="date"
                name="to"
                defaultValue={dateTo ?? ""}
                disabled={period != null}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Status</span>
              <select
                name="status"
                defaultValue={status}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                name="lotusMissing"
                value="yes"
                defaultChecked={lotusProductMissing}
                className="rounded border-sand-dark/60"
              />
              Lotus product missing
            </label>
            <button
              type="submit"
              className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
            >
              Apply
            </button>
          </form>
          {(dateFrom || dateTo || period || lotusProductMissing) && (
            <p className="mt-2 text-xs text-ink-muted">
              {period ? (
                <>
                  Showing <span className="text-dark">{DATE_PERIOD_LABELS[period]}</span>
                  {" "}
                  <span className="text-ink-faint">
                    ({dateFrom} – {dateTo})
                  </span>
                </>
              ) : dateFrom || dateTo ? (
                <>
                  Order date{" "}
                  {dateFrom && dateTo
                    ? `${dateFrom} – ${dateTo}`
                    : dateFrom
                      ? `from ${dateFrom}`
                      : `to ${dateTo}`}
                </>
              ) : null}
              {lotusProductMissing && (
                <span className={dateFrom || dateTo || period ? " · " : ""}>
                  No linked Lotus product on any line
                </span>
              )}
            </p>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            {total === 0
              ? "No orders synced yet."
              : `${total} order${total === 1 ? "" : "s"}`}
            {total > 0 && (
              <span className="text-ink-faint">
                {" "}
                · {rangeStart}–{rangeEnd}
              </span>
            )}
          </p>

          {orders.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              Use Sync from WooCommerce to import orders (default: last 90 days).
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
                <table className="w-full min-w-[48rem] text-left text-xs">
                  <thead className="bg-surface text-dark">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">Order</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Customer</th>
                      <th className="px-2 py-1.5 font-medium">Lotus product</th>
                      <th className="px-2 py-1.5 font-medium">Payment</th>
                      <th className="px-2 py-1.5 font-medium">CCY</th>
                      <th className="px-2 py-1.5 font-medium text-right">Total</th>
                      <th className="px-2 py-1.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-overlay">
                    {orders.map((order) => (
                      <Fragment key={order.id}>
                        <tr className="group align-top border-b border-sand-dark/30 hover:bg-sand/20">
                          <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                            {formatDateShort(order.dateCreated)}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-dark">
                              #{order.orderNumber ?? order.wcOrderId}
                            </div>
                            <div
                              className="max-w-[10rem] truncate font-mono text-[10px] text-ink-faint"
                              title={`WC ${order.wcOrderId}`}
                            >
                              wc:{order.wcOrderId}
                            </div>
                            {order.transactionId && (
                              <div
                                className="max-w-[10rem] truncate font-mono text-[10px] text-ink-faint"
                                title={order.transactionId}
                              >
                                {order.transactionId}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="px-2 py-1.5">
                            <MemberCell order={order} />
                          </td>
                          <td className="px-2 py-1.5 max-w-[8rem]">
                            <LotusProductsCell order={order} />
                          </td>
                          <td className="px-2 py-1.5 text-ink-muted">
                            {order.paymentMethodTitle ??
                              order.paymentMethod ??
                              "—"}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] uppercase text-ink-muted">
                            {order.currency}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                            {formatWooCommerceMoneyMinor(
                              order.totalMinor,
                              order.currency,
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Link
                              to={orderDetailHref(order.id, returnTo)}
                              className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                        <OrderLinesRow order={order} />
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <nav
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  aria-label="Orders pagination"
                >
                  <p className="text-ink-muted">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <Link
                        to={pageHref(page - 1, listFilters)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Previous
                      </Link>
                    ) : null}
                    {page < totalPages ? (
                      <Link
                        to={pageHref(page + 1, listFilters)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Next
                      </Link>
                    ) : null}
                  </div>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </AppPage>
  );
}
