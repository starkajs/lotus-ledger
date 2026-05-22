import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.orders.$orderId";
import { AppPage } from "~/components/app-page";
import { getWooCommerceSiteUrl } from "~/lib/env.server";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import { getWooCommerceOrderById } from "~/lib/woocommerce-orders.server";
import { requireUser } from "~/lib/session.server";

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

  const siteUrl = getWooCommerceSiteUrl();
  const wpAdminOrderUrl = siteUrl
    ? `${siteUrl}/wp-admin/post.php?post=${order.wcOrderId}&action=edit`
    : null;

  return { order, returnTo, wpAdminOrderUrl };
}

export default function WooCommerceOrderDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { order, returnTo, wpAdminOrderUrl } = loaderData;
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

      {order.lineItems.length > 0 && (
        <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
          <h2 className="text-sm font-medium text-dark">Line items</h2>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/40">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                {order.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 text-dark">{line.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-ink-muted">
                      {line.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{line.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono text-dark">
                      {formatWooCommerceMoneyMinor(line.totalMinor, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
