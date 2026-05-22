import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/community.$memberId";
import { AppPage } from "~/components/app-page";
import {
  getCommunityMemberById,
  type CommunityMemberStripeLink,
} from "~/lib/community-members.server";
import { formatCountryName } from "~/lib/country-code";
import { formatMoneyMinor } from "~/lib/money";
import { requireUser } from "~/lib/session.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import {
  countStripeBalanceTransactionsForMember,
  listStripeBalanceTransactionsForMember,
  STRIPE_TRANSACTIONS_PAGE_SIZE,
  type StripeBalanceTransactionForMember,
} from "~/lib/stripe-balance-transactions.server";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  countWooCommerceOrdersForMember,
  listWooCommerceOrdersForMember,
  WOOCOMMERCE_ORDERS_PAGE_SIZE,
  type WooCommerceOrderRecord,
} from "~/lib/woocommerce-orders.server";

type MemberTab = "stripe" | "stripe-customers" | "woocommerce";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
    <div className="grid gap-1 border-b border-sand-dark/30 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="text-sm text-dark">{children}</dd>
    </div>
  );
}

function memberHref(
  memberId: string,
  options: { tab: MemberTab; page?: number; returnTo: string },
) {
  const params = new URLSearchParams({ returnTo: options.returnTo });
  if (options.tab === "woocommerce") params.set("tab", "woocommerce");
  else if (options.tab === "stripe-customers") params.set("tab", "stripe-customers");
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const query = params.toString();
  return `/community/${memberId}?${query}`;
}

function transactionHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function orderHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/orders/${orderId}?${params}`;
}

function tabClass(active: boolean) {
  return [
    "rounded-t-jamyang px-4 py-2 text-sm font-medium transition-colors",
    active
      ? "border border-b-0 border-sand-dark/50 bg-surface-overlay text-maroon"
      : "text-ink-muted hover:bg-sand/40 hover:text-dark",
  ].join(" ");
}

function OrderStatusBadge({ status }: { status: string }) {
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

function Pagination({
  page,
  totalPages,
  prevHref,
  nextHref,
}: {
  page: number;
  totalPages: number;
  prevHref: string;
  nextHref: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
      aria-label="Pagination"
    >
      <p className="text-ink-muted">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            to={prevHref}
            className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-jamyang-pill border border-sand-dark/30 px-3 py-1 text-ink-faint">
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link
            to={nextHref}
            className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-jamyang-pill border border-sand-dark/30 px-3 py-1 text-ink-faint">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

function StripeCustomersPanel({
  stripeLinks,
  connectionLabels,
}: {
  stripeLinks: CommunityMemberStripeLink[];
  connectionLabels: Record<string, string>;
}) {
  return (
    <>
      <p className="text-xs text-ink-muted">
        {stripeLinks.length === 0
          ? "No Stripe customer links for this member."
          : `${stripeLinks.length} Stripe customer${stripeLinks.length === 1 ? "" : "s"} linked`}
      </p>

      {stripeLinks.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Links are created when Stripe customers or synced transactions match this
          member&apos;s email.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 rounded-jamyang border border-sand-dark/50 bg-surface px-4 py-3 text-sm">
          {stripeLinks.map((link) => (
            <li key={link.id} className="font-mono text-xs">
              <span className="text-dark">
                {connectionLabels[link.stripeConnectionId] ?? "Stripe account"}
              </span>
              <span className="text-ink-muted"> · {link.stripeCustomerId}</span>
              {link.stripeCustomerCreatedAt && (
                <span className="text-ink-faint">
                  {" "}
                  · customer since {formatDate(link.stripeCustomerCreatedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StripeTransactionsPanel({
  transactions,
  total,
  page,
  pageSize,
  totalPages,
  connectionLabels,
  memberId,
  returnTo,
  memberReturnTo,
}: {
  transactions: StripeBalanceTransactionForMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  connectionLabels: Record<string, string>;
  memberId: string;
  returnTo: string;
  memberReturnTo: string;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <p className="text-xs text-ink-muted">
        {total === 0
          ? "No synced transactions linked to this member."
          : `${total} transaction${total === 1 ? "" : "s"} · showing ${rangeStart}–${rangeEnd}`}
      </p>

      {transactions.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Sync transactions from the{" "}
          <Link to="/integrations/stripe/transactions" className="text-teal underline">
            Stripe transactions
          </Link>{" "}
          page.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Account</th>
                  <th className="px-2 py-1.5 font-medium">Transaction</th>
                  <th className="px-2 py-1.5 font-medium text-right">Net</th>
                  <th className="px-2 py-1.5 font-medium">QB</th>
                  <th className="px-2 py-1.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-sand/20">
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                      {formatDateShort(tx.stripeCreatedAt)}
                    </td>
                    <td className="px-2 py-1.5 text-dark">
                      {tx.connectionLabel ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="capitalize text-dark">{tx.type}</div>
                      <div
                        className="max-w-[12rem] truncate text-ink-faint"
                        title={tx.description ?? undefined}
                      >
                        {tx.description ?? "—"}
                      </div>
                      {tx.stripePaymentIntentId && (
                        <div
                          className="max-w-[12rem] truncate font-mono text-[10px] text-ink-faint"
                          title={tx.stripePaymentIntentId}
                        >
                          {tx.stripePaymentIntentId}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                      {formatMoneyMinor(tx.net, tx.currency)}
                    </td>
                    <td className="px-2 py-1.5">
                      {tx.pushedToQuickbooks ? (
                        <span className="inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium text-jade">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-sand/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Link
                        to={transactionHref(tx.id, memberReturnTo)}
                        className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            prevHref={memberHref(memberId, {
              tab: "stripe",
              page: page - 1,
              returnTo,
            })}
            nextHref={memberHref(memberId, {
              tab: "stripe",
              page: page + 1,
              returnTo,
            })}
          />
        </>
      )}
    </>
  );
}

function WooCommerceOrdersPanel({
  orders,
  total,
  page,
  pageSize,
  totalPages,
  memberId,
  returnTo,
  memberReturnTo,
}: {
  orders: WooCommerceOrderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  memberId: string;
  returnTo: string;
  memberReturnTo: string;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <p className="text-xs text-ink-muted">
        {total === 0
          ? "No WooCommerce orders linked to this member."
          : `${total} order${total === 1 ? "" : "s"} · showing ${rangeStart}–${rangeEnd}`}
      </p>

      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Sync orders from the{" "}
          <Link
            to="/integrations/woocommerce/orders"
            className="text-teal underline"
          >
            WooCommerce orders
          </Link>{" "}
          page (billing email must match this member).
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Order</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
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
                      </td>
                      <td className="px-2 py-1.5">
                        <OrderStatusBadge status={order.status} />
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
                          to={orderHref(order.id, memberReturnTo)}
                          className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                    {order.lineSummary && (
                      <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
                        <td className="px-2 pb-1.5 pt-0" />
                        <td
                          colSpan={6}
                          className="px-2 pb-2 pt-0 text-[10px] text-ink-muted"
                        >
                          <span className="text-ink-faint">Lines: </span>
                          {order.lineSummary}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            prevHref={memberHref(memberId, {
              tab: "woocommerce",
              page: page - 1,
              returnTo,
            })}
            nextHref={memberHref(memberId, {
              tab: "woocommerce",
              page: page + 1,
              returnTo,
            })}
          />
        </>
      )}
    </>
  );
}

export function meta({ data }: Route.MetaArgs) {
  const label = data?.member.name ?? data?.member.email ?? "Member";
  return [
    { title: `${label} — Community` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/community";
  const tabParam = url.searchParams.get("tab");
  const tab: MemberTab =
    tabParam === "woocommerce"
      ? "woocommerce"
      : tabParam === "stripe-customers"
        ? "stripe-customers"
        : "stripe";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const member = await getCommunityMemberById(params.memberId);
  if (!member) {
    throw new Response("Member not found", { status: 404 });
  }

  const memberReturnTo = `${url.pathname}${url.search}`;

  const [connections, stripeCount, wcCount, stripeData, wcData] =
    await Promise.all([
      listStripeConnections(),
      countStripeBalanceTransactionsForMember(member.id),
      countWooCommerceOrdersForMember(member.id),
      tab === "stripe"
        ? listStripeBalanceTransactionsForMember({
            communityMemberId: member.id,
            page,
          })
        : Promise.resolve(null),
      tab === "woocommerce"
        ? listWooCommerceOrdersForMember({
            communityMemberId: member.id,
            page,
          })
        : Promise.resolve(null),
    ]);

  const connectionLabels = Object.fromEntries(
    connections.map((c) => [c.id, c.label]),
  );

  return {
    member,
    returnTo,
    memberReturnTo,
    tab,
    connectionLabels,
    stripeCount,
    wcCount,
    stripe: stripeData ?? {
      transactions: [],
      total: stripeCount,
      page: 1,
      pageSize: STRIPE_TRANSACTIONS_PAGE_SIZE,
      totalPages: 1,
    },
    woocommerce: wcData ?? {
      orders: [],
      total: wcCount,
      page: 1,
      pageSize: WOOCOMMERCE_ORDERS_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

export default function CommunityMemberPage({ loaderData }: Route.ComponentProps) {
  const {
    member,
    returnTo,
    memberReturnTo,
    tab,
    connectionLabels,
    stripeCount,
    wcCount,
    stripe,
    woocommerce,
  } = loaderData;

  const country = formatCountryName(member.countryCode);

  return (
    <AppPage
      title={member.name ?? member.email}
      description={member.name ? member.email : undefined}
      actions={
        <Link
          to={returnTo}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Back to community
        </Link>
      }
    >
      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <dl>
          <DetailRow label="Email">{member.email}</DetailRow>
          <DetailRow label="Joined">{formatDate(member.joinedAt)}</DetailRow>
          <DetailRow label="City">{member.city ?? "—"}</DetailRow>
          <DetailRow label="Country">
            {member.countryCode ? (
              <span>
                {country ?? member.countryCode}{" "}
                <span className="font-mono text-xs text-ink-faint">
                  ({member.countryCode})
                </span>
              </span>
            ) : (
              "—"
            )}
          </DetailRow>
          {(member.addressLine1 || member.postalCode) && (
            <DetailRow label="Address">
              <span className="block">
                {member.addressLine1}
                {member.addressLine2 ? `, ${member.addressLine2}` : ""}
              </span>
              {(member.city || member.postalCode) && (
                <span className="block text-ink-muted">
                  {[member.city, member.state, member.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
            </DetailRow>
          )}
        </dl>
      </div>

      <section className="mt-8">
        <nav
          className="flex flex-wrap gap-1 border-b border-sand-dark/50"
          aria-label="Member activity"
        >
          <Link
            to={memberHref(member.id, { tab: "stripe", returnTo })}
            className={tabClass(tab === "stripe")}
            aria-current={tab === "stripe" ? "page" : undefined}
          >
            Stripe transactions ({stripeCount})
          </Link>
          <Link
            to={memberHref(member.id, { tab: "stripe-customers", returnTo })}
            className={tabClass(tab === "stripe-customers")}
            aria-current={tab === "stripe-customers" ? "page" : undefined}
          >
            Stripe customers ({member.stripeLinks.length})
          </Link>
          <Link
            to={memberHref(member.id, { tab: "woocommerce", returnTo })}
            className={tabClass(tab === "woocommerce")}
            aria-current={tab === "woocommerce" ? "page" : undefined}
          >
            WooCommerce orders ({wcCount})
          </Link>
        </nav>

        <div className="rounded-b-jamyang-lg rounded-tr-jamyang-lg border border-t-0 border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
          {tab === "stripe" ? (
            <StripeTransactionsPanel
              transactions={stripe.transactions}
              total={stripe.total}
              page={stripe.page}
              pageSize={stripe.pageSize}
              totalPages={stripe.totalPages}
              connectionLabels={connectionLabels}
              memberId={member.id}
              returnTo={returnTo}
              memberReturnTo={memberReturnTo}
            />
          ) : tab === "stripe-customers" ? (
            <StripeCustomersPanel
              stripeLinks={member.stripeLinks}
              connectionLabels={connectionLabels}
            />
          ) : (
            <WooCommerceOrdersPanel
              orders={woocommerce.orders}
              total={woocommerce.total}
              page={woocommerce.page}
              pageSize={woocommerce.pageSize}
              totalPages={woocommerce.totalPages}
              memberId={member.id}
              returnTo={returnTo}
              memberReturnTo={memberReturnTo}
            />
          )}
        </div>
      </section>
    </AppPage>
  );
}