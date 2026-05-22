import { Form, Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { formatMoneyMinor } from "~/lib/money";
import {
  listStripeBalanceTransactions,
  STRIPE_TRANSACTIONS_PAGE_SIZE,
  type StripeBalanceTransactionRecord,
} from "~/lib/stripe-balance-transactions.server";
import { requireUser } from "~/lib/session.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import { syncStripeBalanceTransactions } from "~/lib/sync-stripe-transactions.server";

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TransactionFilters = {
  account: string;
  pushed: "all" | "yes" | "no";
};

function pageHref(page: number, filters: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters.account) params.set("account", filters.account);
  if (filters.pushed !== "all") params.set("pushed", filters.pushed);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function communityMemberHref(tx: StripeBalanceTransactionRecord) {
  if (!tx.memberEmail) return null;
  return `/community?q=${encodeURIComponent(tx.memberEmail)}`;
}

function MemberCell({ tx }: { tx: StripeBalanceTransactionRecord }) {
  const href = communityMemberHref(tx);
  if (href) {
    return (
      <Link to={href} className="text-teal hover:underline">
        <span className="block truncate max-w-[10rem] text-dark">
          {tx.memberName ?? tx.memberEmail}
        </span>
        {tx.stripeCustomerId && (
          <span className="font-mono text-[10px] text-ink-faint">
            {tx.stripeCustomerId}
          </span>
        )}
      </Link>
    );
  }
  if (tx.stripeCustomerId) {
    return (
      <span className="font-mono text-[10px] text-ink-faint" title="No community member">
        {tx.stripeCustomerId}
      </span>
    );
  }
  return <span className="text-ink-faint">—</span>;
}

function transactionDetailHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stripe transactions — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const connections = await listStripeConnections();

  const account =
    url.searchParams.get("account") ?? connections[0]?.id ?? "";
  const pushedRaw = url.searchParams.get("pushed");
  const pushed: TransactionFilters["pushed"] =
    pushedRaw === "yes" || pushedRaw === "no" ? pushedRaw : "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const txList = await listStripeBalanceTransactions({
    stripeConnectionId: account || undefined,
    pushedToQuickbooks: pushed,
    page,
    pageSize: STRIPE_TRANSACTIONS_PAGE_SIZE,
  });

  const connectionLabels = Object.fromEntries(
    connections.map((c) => [c.id, c.label]),
  );

  return {
    connections,
    account,
    pushed,
    connectionLabels,
    ...txList,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "sync") {
    const connectionId = String(form.get("connectionId") ?? "").trim() || undefined;
    const last30Days = form.get("last30Days") === "1";
    try {
      const result = await syncStripeBalanceTransactions({
        connectionId,
        days: last30Days ? 30 : undefined,
      });
      return { scope: "sync" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "sync" as const,
        error: err instanceof Error ? err.message : "Sync failed",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function StripeTransactionsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    connections,
    account,
    pushed,
    connectionLabels,
    transactions,
    total,
    page,
    pageSize,
    totalPages,
  } = loaderData;
  const location = useLocation();

  const filters: TransactionFilters = { account, pushed };
  const hasFilters = pushed !== "all";
  const returnTo = `${location.pathname}${location.search}`;
  const showAccountColumn = connections.length > 1;

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <AppPage
      title="Stripe transactions"
      description="Balance transactions synced from each connected Stripe account."
      actions={
        connections.length > 0 ? (
          <Form method="post" className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="intent" value="sync" />
            {account ? (
              <input type="hidden" name="connectionId" value={account} />
            ) : null}
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                name="last30Days"
                value="1"
                className="rounded border-sand-dark/60"
              />
              Last 30 days only
            </label>
            <SubmitButton
              intent="sync"
              variant="pill"
              loadingLabel="Syncing from Stripe…"
            >
              Sync from Stripe
            </SubmitButton>
          </Form>
        ) : undefined
      }
    >
      <p className="text-sm text-ink-muted">
        <Link to="/integrations/stripe" className="text-teal underline">
          Stripe settings
        </Link>
      </p>

      {connections.length === 0 && (
        <p
          role="status"
          className="mt-4 rounded-jamyang border border-sand-dark/50 bg-sand/30 p-4 text-sm text-ink-muted"
        >
          Add a Stripe account under{" "}
          <Link to="/integrations/stripe" className="text-teal underline">
            Stripe integrations
          </Link>{" "}
          before syncing transactions.
        </p>
      )}

      {syncResult && (
        <div
          role="status"
          className="mt-4 rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
        >
          <p className="font-medium text-dark">Stripe sync complete</p>
          <ul className="mt-2 list-inside list-disc text-ink-muted">
            <li>{syncResult.connectionsProcessed} account(s) processed</li>
            <li>{syncResult.created} new transactions</li>
            <li>{syncResult.updated} updated</li>
            <li>{syncResult.skippedNotPosted} skipped (not posted)</li>
            <li>{syncResult.membersLinked} linked to community</li>
            {syncResult.daysLimit != null && (
              <li>
                Limited to last {syncResult.daysLimit} days
                {syncResult.stoppedAtCutoff ? " (stopped at cutoff)" : ""}
              </li>
            )}
          </ul>
        </div>
      )}

      {syncError && (
        <p role="alert" className="mt-4 text-sm text-maroon">
          {syncError}
        </p>
      )}

      {connections.length > 0 && (
        <>
          <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Stripe account</span>
              <select
                name="account"
                defaultValue={account}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">QuickBooks</span>
              <select
                name="pushed"
                defaultValue={pushed}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="no">Not pushed</option>
                <option value="yes">Pushed</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
            >
              Apply
            </button>
            {hasFilters && (
              <Link
                to={account ? `?account=${account}` : "?"}
                className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm text-ink-muted hover:bg-surface"
              >
                Clear filters
              </Link>
            )}
          </form>

          <p className="mt-3 text-xs text-ink-muted">
            {total === 0
              ? "No transactions in the database for this view."
              : `${total} transaction${total === 1 ? "" : "s"}`}
            {total > 0 && (
              <span className="text-ink-faint">
                {" "}
                · {rangeStart}–{rangeEnd}
              </span>
            )}
          </p>

          {transactions.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              Use Sync from Stripe to import balance transactions.
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
                <table className="w-full min-w-[40rem] text-left text-xs">
                  <thead className="bg-surface text-dark">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      {showAccountColumn && (
                        <th className="px-2 py-1.5 font-medium">Account</th>
                      )}
                      <th className="px-2 py-1.5 font-medium">Transaction</th>
                      <th className="px-2 py-1.5 font-medium">Customer</th>
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
                        {showAccountColumn && (
                          <td className="px-2 py-1.5 text-dark">
                            {connectionLabels[tx.stripeConnectionId] ?? "—"}
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <div className="capitalize text-dark">{tx.type}</div>
                          <div
                            className="max-w-[14rem] truncate text-ink-faint"
                            title={tx.description ?? tx.stripeBalanceTransactionId}
                          >
                            {tx.description ?? tx.stripeBalanceTransactionId}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <MemberCell tx={tx} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-dark whitespace-nowrap">
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
                            to={transactionDetailHref(tx.id, returnTo)}
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
                  aria-label="Transactions pagination"
                >
                  <p className="text-ink-muted">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <Link
                        to={pageHref(page - 1, filters)}
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
                        to={pageHref(page + 1, filters)}
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
        </>
      )}
    </AppPage>
  );
}
