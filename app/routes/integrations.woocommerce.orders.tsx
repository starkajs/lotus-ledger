import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.orders";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { WooCommerceOrdersBulkAssignForm } from "~/components/woocommerce-orders-bulk-assign-form";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import {
  WooCommerceOrdersFilterForm,
  WooCommerceOrdersFilterSummary,
} from "~/components/woocommerce-orders-filter-form";
import {
  parseWooCommerceOrderFiltersFromUrl,
  wooCommerceOrdersHref,
  type WooCommerceOrderListFilters,
} from "~/lib/woocommerce-orders-filters";
import { classifyStripeTransactionsForWooCommerceLinks } from "~/lib/product-classification.server";
import { formatNewlyMappedStripeTransactions } from "~/lib/stripe-product-bulk-assign";
import { listProducts } from "~/lib/products.server";
import {
  bulkSetWooCommerceOrderLotusProducts,
  listDistinctWooCommerceOrderStatuses,
  listWooCommerceOrdersFromDb,
  type WooCommerceOrderRecord,
} from "~/lib/woocommerce-orders.server";
import { WOOCOMMERCE_ORDER_APP_SYNC_DAYS } from "~/lib/woocommerce-orders.constants";
import { syncWooCommerceOrders } from "~/lib/sync-woocommerce-orders.server";
import { requireUser } from "~/lib/session.server";

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const ORDERS_PATH = "/integrations/woocommerce/orders";
const SUMMARY_PATH = "/integrations/woocommerce/orders/summary";

function orderDetailHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/orders/${orderId}?${params}`;
}

function stripeTransactionHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function StripeCell({
  order,
  returnTo,
}: {
  order: WooCommerceOrderRecord;
  returnTo: string;
}) {
  const linked = order.linkedStripeTransactions;
  if (linked.length > 0) {
    const primary = linked[0]!;
    return (
      <div>
        <Link
          to={stripeTransactionHref(primary.id, returnTo)}
          className="font-mono text-[10px] text-teal hover:underline"
          title={primary.stripeBalanceTransactionId}
        >
          {primary.stripeBalanceTransactionId.slice(0, 14)}…
        </Link>
        <span className="mt-0.5 block text-[10px] font-medium text-jade">
          Linked{linked.length > 1 ? ` (+${linked.length - 1})` : ""}
        </span>
      </div>
    );
  }
  if (order.orderKey) {
    return (
      <div className="max-w-[9rem]" title={order.orderKey}>
        <span className="text-[10px] text-ink-faint">No Stripe match</span>
        <span className="block truncate font-mono text-[10px] text-ink-muted">
          {order.orderKey}
        </span>
      </div>
    );
  }
  return <span className="text-ink-faint">—</span>;
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

function orderNeedsLotusProduct(order: WooCommerceOrderRecord) {
  return order.lotusProducts.length === 0;
}

function OrderLinesRow({ order }: { order: WooCommerceOrderRecord }) {
  const items = order.lineItems;
  const unmappedOrder = orderNeedsLotusProduct(order);
  if (items.length === 0) {
    if (!order.lineSummary) return null;
    return (
      <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
        <td className="px-2 pb-1.5 pt-0" />
        <td colSpan={10} className="px-2 pb-2 pt-0 text-[10px] text-ink-muted">
          <span className="text-ink-faint">Lines: </span>
          {order.lineSummary}
        </td>
      </tr>
    );
  }

  const contextByLine = new Map(
    order.lineContext.map((line) => [line.lineId, line]),
  );
  const visible = items.slice(0, 8);
  const more = items.length - visible.length;

  return (
    <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
      <td className="px-2 pb-1.5 pt-0" />
      <td colSpan={10} className="px-2 pb-2 pt-0">
        <ul className="space-y-1.5">
          {visible.map((item) => {
            const context = contextByLine.get(item.id);
            return (
              <li key={item.id} className="text-[11px] leading-snug text-ink-muted">
                <span className="text-dark">
                  {item.quantity > 1 ? `${item.quantity}× ` : ""}
                  {item.name}
                </span>
                {context?.catalogName ? (
                  <span className="mt-0.5 block text-dark">{context.catalogName}</span>
                ) : null}
                {context?.eventTitle ? (
                  <span className="mt-0.5 block text-dark">{context.eventTitle}</span>
                ) : null}
                {context?.detail ? (
                  <span className="mt-0.5 block">{context.detail}</span>
                ) : null}
                {item.sku ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                    SKU {item.sku}
                  </span>
                ) : null}
                {context?.lotusCode ? (
                  <span
                    className="mt-0.5 block font-mono text-[10px] text-teal"
                    title={context.lotusName ?? undefined}
                  >
                    {context.lotusCode}
                  </span>
                ) : unmappedOrder ? (
                  <span className="mt-0.5 block text-[10px] font-medium text-maroon">
                    Not mapped
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {more > 0 ? (
          <p className="mt-1 text-[10px] text-ink-faint">+{more} more lines</p>
        ) : null}
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
  const parsed = parseWooCommerceOrderFiltersFromUrl(url.searchParams);

  const [list, statuses, catalogProducts] = await Promise.all([
    listWooCommerceOrdersFromDb({
      page,
      status: parsed.status,
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      lotusProductMissing: parsed.lotusProductMissing,
      lotusProductId: parsed.lotusProductId,
      amountMin: parsed.amountMin,
      amountMax: parsed.amountMax,
      stripeSearch: parsed.stripeSearch,
      stripeLinked: parsed.stripeLinked,
    }),
    listDistinctWooCommerceOrderStatuses(),
    listProducts(),
  ]);

  const status =
    statuses.includes(parsed.status) || parsed.status === "all"
      ? parsed.status
      : "all";

  return {
    ...list,
    statuses,
    ...parsed,
    status,
    catalogProducts,
    productsLinked: url.searchParams.get("productsLinked"),
    ordersManual: url.searchParams.get("ordersManual"),
    bulkSkipped: url.searchParams.get("bulkSkipped"),
    stripeMapped: url.searchParams.get("stripeMapped"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "bulk-assign-product") {
    const orderIds = form.getAll("orderIds").map((value) => String(value));
    const productId = String(form.get("productId") ?? "").trim();
    if (!productId) {
      return {
        scope: "bulk-assign-product" as const,
        error: "Choose a Lotus product",
      };
    }
    if (orderIds.length === 0) {
      return {
        scope: "bulk-assign-product" as const,
        error: "Select at least one order",
      };
    }
    try {
      const result = await bulkSetWooCommerceOrderLotusProducts(
        orderIds,
        productId,
      );
      const stripe = await classifyStripeTransactionsForWooCommerceLinks({
        wcProductIds: result.linkedWcProductIds,
        woocommerceOrderIds: orderIds,
        audit: { triggeredBy: "app", userId: user.id },
      });
      const params = new URLSearchParams(url.searchParams);
      params.delete("bulkAssigned");
      params.delete("bulkSkipped");
      params.set("productsLinked", String(result.productsLinked));
      params.set("ordersManual", String(result.ordersManual));
      if (result.skipped > 0) {
        params.set("bulkSkipped", String(result.skipped));
      }
      params.set("stripeMapped", String(stripe.newlyMapped));
      const query = params.toString();
      return redirect(query ? `${url.pathname}?${query}` : url.pathname);
    } catch (err) {
      return {
        scope: "bulk-assign-product" as const,
        error: err instanceof Error ? err.message : "Bulk assign failed",
      };
    }
  }

  if (intent !== "sync") {
    return { scope: "sync" as const, error: "Unknown action" };
  }
  try {
    const result = await syncWooCommerceOrders({
      days: WOOCOMMERCE_ORDER_APP_SYNC_DAYS,
      audit: { triggeredBy: "app", userId: user.id },
    });
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
    lotusProductId,
    amountMin,
    amountMax,
    stripeSearch,
    stripeLinked,
    catalogProducts,
    productsLinked,
    ordersManual,
    bulkSkipped,
    stripeMapped,
  } = loaderData;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectableIds = useMemo(
    () => orders.filter(orderNeedsLotusProduct).map((order) => order.id),
    [orders],
  );
  const allSelectableOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelectableOnPageSelected = selectableIds.some((id) =>
    selected.has(id),
  );
  const selectedOrderIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );

  useEffect(() => {
    const input = selectAllRef.current;
    if (!input) return;
    input.indeterminate =
      someSelectableOnPageSelected && !allSelectableOnPageSelected;
  }, [someSelectableOnPageSelected, allSelectableOnPageSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllSelectableOnPage() {
    setSelected((prev) => {
      const allSelected =
        selectableIds.length > 0 &&
        selectableIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of selectableIds) next.delete(id);
      } else {
        for (const id of selectableIds) next.add(id);
      }
      return next;
    });
  }

  const listFilters: WooCommerceOrderListFilters = {
    status,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
    lotusProductId,
    amountMin,
    amountMax,
    stripeSearch,
    stripeLinked,
  };

  const lotusProductLabel =
    catalogProducts.find((product) => product.id === lotusProductId)?.code ??
    null;

  const hasFilters =
    status !== "all" ||
    lotusProductMissing ||
    lotusProductId != null ||
    amountMin != null ||
    amountMax != null ||
    dateFrom != null ||
    dateTo != null ||
    period != null ||
    stripeSearch.length > 0 ||
    stripeLinked !== "all";

  const summaryHref = wooCommerceOrdersHref(SUMMARY_PATH, listFilters);

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;
  const bulkAssignError =
    actionData?.scope === "bulk-assign-product" && actionData.error
      ? actionData.error
      : null;

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
          <div className="flex flex-wrap gap-2">
            <Link
              to={summaryHref}
              className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
            >
              Sales by product
            </Link>
            <Form method="post" action={postAction}>
              <SubmitButton intent="sync" variant="pill" loadingLabel="Syncing…">
                Sync from WooCommerce
              </SubmitButton>
            </Form>
          </div>
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
          {bulkAssignError && (
            <p className="mb-3 text-sm text-maroon" role="alert">
              {bulkAssignError}
            </p>
          )}
          {productsLinked != null && (
            <p className="mb-3 text-sm text-jade" role="status">
              {productsLinked === "0"
                ? "No shop product was linked."
                : `Linked ${productsLinked} shop product${productsLinked === "1" ? "" : "s"}. Every order with ${productsLinked === "1" ? "that product" : "those products"} now uses this Lotus product.`}
              {ordersManual && ordersManual !== "0"
                ? ` ${ordersManual} order${ordersManual === "1" ? "" : "s"} had no shop product, so the Lotus product was set on ${ordersManual === "1" ? "that order" : "those orders"} only.`
                : ""}
              {bulkSkipped && bulkSkipped !== "0"
                ? ` ${bulkSkipped} skipped because they were already mapped.`
                : ""}
              {stripeMapped != null
                ? ` ${formatNewlyMappedStripeTransactions(Number(stripeMapped) || 0)}`
                : ""}
            </p>
          )}
          {syncResult && (
            <p className="mb-3 text-sm text-jade">
              Sync complete: {syncResult.created} created, {syncResult.updated}{" "}
              updated, {syncResult.membersLinked} linked to community members
              {syncResult.daysLimit != null && (
                <span className="text-ink-muted">
                  {" "}
                  (last {syncResult.daysLimit} days)
                </span>
              )}
              .
            </p>
          )}

          <nav className="mb-3 flex gap-3 text-xs" aria-label="Orders views">
            <span className="font-medium text-dark">Orders</span>
            <span className="text-ink-faint" aria-hidden>
              /
            </span>
            <Link
              to={summaryHref}
              className="text-ink-muted hover:text-teal hover:underline"
            >
              Sales by product
            </Link>
          </nav>

          <WooCommerceOrdersFilterForm
            status={status}
            statuses={statuses}
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            lotusProductMissing={lotusProductMissing}
            lotusProductId={lotusProductId}
            catalogProducts={catalogProducts}
            amountMin={amountMin}
            amountMax={amountMax}
            stripeSearch={stripeSearch}
            stripeLinked={stripeLinked}
          />
          <WooCommerceOrdersFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            lotusProductMissing={lotusProductMissing}
            lotusProductLabel={lotusProductLabel}
            amountMin={amountMin}
            amountMax={amountMax}
            stripeSearch={stripeSearch}
            stripeLinked={stripeLinked}
          />

          {hasFilters && (
            <p className="mt-2">
              <Link
                to={ORDERS_PATH}
                className="text-xs text-ink-muted hover:text-teal hover:underline"
              >
                Clear filters
              </Link>
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
              Use Sync from WooCommerce to import orders from the last{" "}
              {WOOCOMMERCE_ORDER_APP_SYNC_DAYS} days.
            </p>
          ) : (
            <>
              <WooCommerceOrdersBulkAssignForm
                selectedCount={selectedOrderIds.length}
                selectedOrderIds={selectedOrderIds}
                catalogProducts={catalogProducts}
                postAction={postAction}
              />
              <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
                <table className="w-full min-w-[54rem] text-left text-xs">
                  <thead className="bg-surface text-dark">
                    <tr>
                      <th className="px-2 py-1.5">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelectableOnPageSelected}
                          onChange={toggleAllSelectableOnPage}
                          disabled={selectableIds.length === 0}
                          aria-label="Select all unmapped orders on this page"
                          className="rounded border-sand-dark/60"
                        />
                      </th>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">Order</th>
                      <th className="px-2 py-1.5 font-medium">Stripe</th>
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
                    {orders.map((order) => {
                      const canSelect = orderNeedsLotusProduct(order);
                      const isSelected = selected.has(order.id);
                      return (
                      <Fragment key={order.id}>
                        <tr
                          className={`group align-top border-b border-sand-dark/30 hover:bg-sand/20 ${isSelected ? "bg-teal/5 hover:bg-teal/10" : ""}`}
                        >
                          <td className="px-2 py-1.5">
                            {canSelect ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOne(order.id)}
                                aria-label={`Select order ${order.orderNumber ?? order.wcOrderId}`}
                                className="rounded border-sand-dark/60"
                              />
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                            {formatCalendarDateShort(order.dateCreated)}
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
                            {order.orderKey && (
                              <div
                                className="max-w-[10rem] truncate font-mono text-[10px] text-ink-faint"
                                title={order.orderKey}
                              >
                                {order.orderKey}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <StripeCell order={order} returnTo={returnTo} />
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
                      );
                    })}
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
                        to={wooCommerceOrdersHref(ORDERS_PATH, listFilters, page - 1)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Previous
                      </Link>
                    ) : null}
                    {page < totalPages ? (
                      <Link
                        to={wooCommerceOrdersHref(ORDERS_PATH, listFilters, page + 1)}
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
