import type { ReactNode } from "react";
import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.orders.$orderId";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { getWooCommerceSiteUrl } from "~/lib/env.server";
import { listProducts } from "~/lib/products.server";
import { requireUser } from "~/lib/session.server";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  lookupOrderLineItemsInWooCommerceCatalog,
  type OrderLineSkuLookup,
} from "~/lib/woocommerce-products.server";
import { LinkedStripeTransactionsTable } from "~/components/linked-stripe-transactions-table";
import { findLinkedStripeTransactionsForWooCommerceOrder } from "~/lib/wc-stripe-order-link.server";
import {
  getWooCommerceOrderById,
  setWooCommerceOrderLotusProduct,
} from "~/lib/woocommerce-orders.server";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-sand-dark/30 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="text-sm text-dark break-all">{children}</dd>
    </div>
  );
}

function MultilineText({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words text-dark">{value}</span>
  );
}

export function meta({ data }: Route.MetaArgs) {
  const label =
    data?.order.orderNumber != null
      ? `#${data.order.orderNumber}`
      : `Order ${data?.order.wcOrderId ?? ""}`;
  return [
    { title: `${label} — Lotus Ledger` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const order = await getWooCommerceOrderById(params.orderId);
  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("returnTo") ?? "/integrations/woocommerce/orders";

  const catalogProducts = await listProducts();
  const manualLotus = order.lotusProducts.find((p) => p.source === "manual");
  const lineLotusProducts = order.lotusProducts.filter((p) => p.source === "line");
  const options =
    manualLotus && !catalogProducts.some((p) => p.id === manualLotus.catalogProductId)
      ? [
          {
            id: manualLotus.catalogProductId,
            code: manualLotus.code,
            name: manualLotus.name,
            quickbooksItemId: null,
            isActive: false,
            sortOrder: 0,
            createdAt: "",
            updatedAt: "",
          },
          ...catalogProducts,
        ]
      : catalogProducts;

  const lineLookups = await lookupOrderLineItemsInWooCommerceCatalog(
    order.lineItems,
  );

  const siteUrl = getWooCommerceSiteUrl();
  const wpAdminOrderUrl = siteUrl
    ? `${siteUrl}/wp-admin/post.php?post=${order.wcOrderId}&action=edit`
    : null;

  const linkedStripeTransactions =
    await findLinkedStripeTransactionsForWooCommerceOrder(params.orderId);

  return {
    order,
    returnTo,
    catalogProducts: options,
    manualLotus,
    lineLotusProducts,
    lineLookups,
    wpAdminOrderUrl,
    linkedStripeTransactions,
  };
}

function LineLotusProductCell({ lookup }: { lookup: OrderLineSkuLookup }) {
  if (lookup.status === "no_sku") {
    return <span className="text-ink-faint">No SKU to look up</span>;
  }
  if (lookup.status === "wc_deleted") {
    return (
      <span className="text-maroon">
        Not in WC catalog — product may have been deleted
      </span>
    );
  }
  if (lookup.status === "wc_unmapped") {
    return (
      <span className="text-ink-muted">
        In WC (
        <Link
          to={`/integrations/woocommerce/products/${lookup.wcProductInternalId}`}
          className="text-teal hover:underline"
        >
          {lookup.wcProductName}
        </Link>
        ) · Lotus product not mapped
      </span>
    );
  }
  if (lookup.lotusProduct) {
    return (
      <span>
        <Link to="/products" className="font-mono text-teal hover:underline">
          {lookup.lotusProduct.code}
        </Link>
        <span className="text-ink-muted"> — {lookup.lotusProduct.name}</span>
      </span>
    );
  }
  return <span className="text-ink-faint">—</span>;
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const returnTo = String(
    form.get("returnTo") ?? "/integrations/woocommerce/orders",
  );

  const detailPath = `/integrations/woocommerce/orders/${params.orderId}`;
  const redirectUrl = `${detailPath}?returnTo=${encodeURIComponent(returnTo)}`;

  if (intent === "setLotusProduct") {
    const productId = String(form.get("productId") ?? "").trim() || null;
    try {
      await setWooCommerceOrderLotusProduct(params.orderId, productId);
      return redirect(redirectUrl);
    } catch (err) {
      return {
        scope: "lotusProduct" as const,
        error: err instanceof Error ? err.message : "Failed to save link",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function WooCommerceOrderDetailPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    order,
    returnTo,
    catalogProducts,
    manualLotus,
    lineLotusProducts,
    lineLookups,
    wpAdminOrderUrl,
    linkedStripeTransactions,
  } = loaderData;
  const lineLookupById = new Map(
    lineLookups.map((lookup) => [lookup.lineId, lookup]),
  );
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const billingName = [order.billingFirstName, order.billingLastName]
    .filter(Boolean)
    .join(" ");

  return (
    <AppPage
      title="WooCommerce order"
      description={`#${order.orderNumber ?? order.wcOrderId}`}
      actions={
        <Link
          to={returnTo}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Back to list
        </Link>
      }
    >
      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Lotus product</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Assign a catalog product for this order when WC line items cannot be
          mapped (e.g. deleted shop products). Line-item mappings from WC
          products are shown below and are combined with any manual assignment.
        </p>
        {manualLotus ? (
          <p className="mt-2 text-sm text-dark">
            <span className="text-ink-muted">Manual: </span>
            <Link to="/products" className="font-mono text-teal hover:underline">
              {manualLotus.code}
            </Link>
            <span className="text-ink-muted"> — {manualLotus.name}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No manual assignment</p>
        )}
        {lineLotusProducts.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            From line items:{" "}
            {lineLotusProducts.map((p) => p.code).join(", ")}
          </p>
        )}
        <Form
          method="post"
          action={postAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Manual Lotus product</span>
            <select
              name="productId"
              defaultValue={order.productId ?? ""}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[14rem]"
            >
              <option value="">— None —</option>
              {catalogProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                  {!p.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton
            intent="setLotusProduct"
            variant="pill"
            loadingLabel="Saving…"
          >
            Save assignment
          </SubmitButton>
        </Form>
        {actionData?.scope === "lotusProduct" && actionData.error && (
          <p className="mt-2 text-sm text-maroon" role="alert">
            {actionData.error}
          </p>
        )}
      </div>

      <div className="mb-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Stripe payment</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Linked when Stripe charge metadata{" "}
          <span className="font-mono">order_key</span> matches this order&apos;s
          key.
        </p>
        {order.orderKey ? (
          <p className="mt-2 text-xs text-ink-muted">
            Order key:{" "}
            <span className="font-mono text-dark">{order.orderKey}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No order key on this order.</p>
        )}
        {linkedStripeTransactions.length > 0 ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              <span className="mr-2 inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium text-jade">
                Linked
              </span>
              <span className="text-ink-muted">
                {linkedStripeTransactions.length} Stripe transaction
                {linkedStripeTransactions.length === 1 ? "" : "s"}
              </span>
            </p>
            <LinkedStripeTransactionsTable
              transactions={linkedStripeTransactions}
              returnTo={returnTo}
            />
          </div>
        ) : order.orderKey ? (
          <p className="mt-3 text-sm text-ink-muted">
            No synced Stripe transaction with this order key.
          </p>
        ) : null}
      </div>

      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Summary</h2>
        <dl className="mt-3">
          <DetailRow label="Status">
            <span className="capitalize">{order.status.replace(/-/g, " ")}</span>
          </DetailRow>
          <DetailRow label="Total">
            <span className="font-mono">
              {formatWooCommerceMoneyMinor(order.totalMinor, order.currency)} (
              {order.totalMinor} {order.currency.toUpperCase()} minor units)
            </span>
          </DetailRow>
          <DetailRow label="Community member">
            {order.communityMemberId ? (
              <Link
                to={`/community/${order.communityMemberId}`}
                className="text-teal hover:underline"
              >
                {order.memberName ?? order.memberEmail ?? "View member"}
              </Link>
            ) : order.billingEmail ? (
              <Link
                to={`/community?q=${encodeURIComponent(order.billingEmail)}`}
                className="text-teal hover:underline"
              >
                {order.billingEmail}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Billing email">{order.billingEmail ?? "—"}</DetailRow>
          <DetailRow label="Billing name">{billingName || "—"}</DetailRow>
          <DetailRow label="Payment">
            {order.paymentMethodTitle ?? order.paymentMethod ?? "—"}
          </DetailRow>
          <DetailRow label="Order key">
            {order.orderKey ? (
              <span className="font-mono text-xs">{order.orderKey}</span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Transaction ID">
            {order.transactionId ? (
              <span className="font-mono text-xs">{order.transactionId}</span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Created">{formatDateTime(order.dateCreated)}</DetailRow>
          <DetailRow label="Paid">{formatDateTime(order.datePaid)}</DetailRow>
        </dl>
      </div>

      {(order.lineItems.length > 0 || order.lineSummary) && (
        <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
          <h2 className="text-sm font-medium text-dark">Order lines</h2>
          <p className="mt-1 text-xs text-ink-muted">
            What this order was for. Lines are matched to the synced WC product
            catalog by SKU (then WC product id).
          </p>
          {order.lineItems.length === 0 && order.lineSummary ? (
            <p className="mt-3 text-sm text-ink-muted">{order.lineSummary}</p>
          ) : null}
          {order.lineItems.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/40">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Lotus product</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                {order.lineItems.map((line) => {
                  const lookup =
                    lineLookupById.get(line.id) ?? {
                      lineId: line.id,
                      sku: line.sku,
                      status: "no_sku" as const,
                      wcProductInternalId: null,
                      wcProductName: null,
                      lotusProduct: null,
                    };
                  const deleted = lookup.status === "wc_deleted";
                  return (
                    <tr
                      key={line.id}
                      className={deleted ? "bg-maroon/5" : undefined}
                    >
                      <td className="px-3 py-2 text-dark">{line.name}</td>
                      <td
                        className={
                          deleted
                            ? "px-3 py-2 font-mono text-[10px] font-medium text-maroon"
                            : "px-3 py-2 font-mono text-[10px] text-ink-muted"
                        }
                      >
                        {line.sku ?? "—"}
                        {deleted && line.productId != null && line.productId > 0 ? (
                          <span className="mt-0.5 block font-sans text-[10px] font-normal text-maroon/90">
                            wc product {line.productId}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        <LineLotusProductCell lookup={lookup} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-dark">
                        {formatWooCommerceMoneyMinor(
                          line.totalMinor,
                          order.currency,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">All fields</h2>
        <dl className="mt-3">
          <DetailRow label="WooCommerce order ID">
            <span className="font-mono text-xs">{order.wcOrderId}</span>
          </DetailRow>
          <DetailRow label="Order number">{order.orderNumber ?? "—"}</DetailRow>
          <DetailRow label="WC customer ID">
            {order.wcCustomerId ?? "—"}
          </DetailRow>
          <DetailRow label="Billing city">{order.billingCity ?? "—"}</DetailRow>
          <DetailRow label="Billing postcode">
            {order.billingPostcode ?? "—"}
          </DetailRow>
          <DetailRow label="Billing country">{order.billingCountry ?? "—"}</DetailRow>
          <DetailRow label="Subtotal">
            {formatWooCommerceMoneyMinor(order.subtotalMinor, order.currency)}
          </DetailRow>
          <DetailRow label="Tax">
            {formatWooCommerceMoneyMinor(order.totalTaxMinor, order.currency)}
          </DetailRow>
          <DetailRow label="Shipping">
            {formatWooCommerceMoneyMinor(order.shippingMinor, order.currency)}
          </DetailRow>
          <DetailRow label="Discount">
            {formatWooCommerceMoneyMinor(order.discountMinor, order.currency)}
          </DetailRow>
          <DetailRow label="Customer note">
            <MultilineText value={order.customerNote} />
          </DetailRow>
          <DetailRow label="Date modified">
            {formatDateTime(order.dateModified)}
          </DetailRow>
          <DetailRow label="Date completed">
            {formatDateTime(order.dateCompleted)}
          </DetailRow>
          <DetailRow label="Payment method">
            {order.paymentMethod ?? "—"}
          </DetailRow>
          <DetailRow label="Synced to Lotus">
            {formatDateTime(order.syncedAt)}
          </DetailRow>
          <DetailRow label="Lotus created">
            {formatDateTime(order.createdAt)}
          </DetailRow>
          <DetailRow label="Lotus updated">
            {formatDateTime(order.updatedAt)}
          </DetailRow>
          <DetailRow label="Internal ID">
            <span className="font-mono text-xs">{order.id}</span>
          </DetailRow>
        </dl>
      </div>

      {order.wcRaw && (
        <details className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark sm:px-6">
            Raw WooCommerce API response
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-sand-dark/40 px-4 py-3 text-xs text-ink-muted sm:px-6">
            {JSON.stringify(order.wcRaw, null, 2)}
          </pre>
        </details>
      )}

      {wpAdminOrderUrl && (
        <p className="mt-4 text-sm text-ink-muted">
          <a
            href={wpAdminOrderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-teal underline-offset-2 hover:underline"
          >
            Open in WordPress admin
          </a>
        </p>
      )}
    </AppPage>
  );
}
