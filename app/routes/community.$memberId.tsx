import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/community.$memberId";
import { AppPage } from "~/components/app-page";
import { getCommunityMemberById } from "~/lib/community-members.server";
import { formatCountryName } from "~/lib/country-code";
import { formatMoneyMinor } from "~/lib/money";
import { requireUser } from "~/lib/session.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import {
  listStripeBalanceTransactionsForMember,
  STRIPE_TRANSACTIONS_PAGE_SIZE,
} from "~/lib/stripe-balance-transactions.server";

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

function transactionHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function txPageHref(memberId: string, page: number, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/community/${memberId}${query ? `?${query}` : ""}`;
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
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const member = await getCommunityMemberById(params.memberId);
  if (!member) {
    throw new Response("Member not found", { status: 404 });
  }

  const [transactions, connections] = await Promise.all([
    listStripeBalanceTransactionsForMember({
      communityMemberId: member.id,
      page,
      pageSize: STRIPE_TRANSACTIONS_PAGE_SIZE,
    }),
    listStripeConnections(),
  ]);

  const connectionLabels = Object.fromEntries(
    connections.map((c) => [c.id, c.label]),
  );

  return {
    member,
    returnTo,
    connectionLabels,
    ...transactions,
  };
}

export default function CommunityMemberPage({ loaderData }: Route.ComponentProps) {
  const {
    member,
    returnTo,
    connectionLabels,
    transactions,
    total,
    page,
    pageSize,
    totalPages,
  } = loaderData;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
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
        <h2 className="text-lg font-medium text-dark">Stripe customers</h2>
        {member.stripeLinks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No Stripe customer links yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 rounded-jamyang border border-sand-dark/50 bg-surface-overlay px-4 py-3 text-sm">
            {member.stripeLinks.map((link) => (
              <li key={link.id} className="font-mono text-xs">
                <span className="text-dark">
                  {connectionLabels[link.stripeConnectionId] ?? "Stripe account"}
                </span>
                <span className="text-ink-muted"> · {link.stripeCustomerId}</span>
                {link.stripeCustomerCreatedAt && (
                  <span className="text-ink-faint">
                    {" "}
                    · customer since{" "}
                    {formatDate(link.stripeCustomerCreatedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-dark">Stripe transactions</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {total === 0
                ? "No synced transactions linked to this member."
                : `${total} transaction${total === 1 ? "" : "s"} · showing ${rangeStart}–${rangeEnd}`}
            </p>
          </div>
          <Link
            to="/integrations/stripe/transactions"
            className="text-sm text-teal underline-offset-2 hover:underline"
          >
            All transactions
          </Link>
        </div>

        {transactions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Sync transactions from the{" "}
            <Link to="/integrations/stripe/transactions" className="text-teal underline">
              Stripe transactions
            </Link>{" "}
            page (with customer linking enabled).
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
                          to={transactionHref(tx.id, returnTo)}
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

            {totalPages > 1 && (
              <nav
                className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                aria-label="Member transactions pagination"
              >
                <p className="text-ink-muted">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link
                      to={txPageHref(member.id, page - 1, returnTo)}
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
                      to={txPageHref(member.id, page + 1, returnTo)}
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
            )}
          </>
        )}
      </section>
    </AppPage>
  );
}
