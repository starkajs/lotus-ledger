import { Fragment } from "react";
import { Form, Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions";
import { AppPage } from "~/components/app-page";
import { QuickbooksPushBadge } from "~/components/quickbooks-push-badge";
import {
  StripeTransactionsFilterForm,
  StripeTransactionsFilterSummary,
} from "~/components/stripe-transactions-filter-form";
import { SubmitButton } from "~/components/submit-button";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import { formatMoneyMinor } from "~/lib/money";
import {
  listAllStripeBalanceTransactions,
  listStripeBalanceTransactions,
  STRIPE_TRANSACTIONS_PAGE_SIZE,
  type StripeBalanceTransactionRecord,
} from "~/lib/stripe-balance-transactions.server";
import { requireUser } from "~/lib/session.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import { classifyAllStripeTransactions } from "~/lib/product-classification.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { pushStripeBalanceTransactionsBulkToQuickBooks } from "~/lib/stripe-quickbooks-push-execute.server";
import { extractStripeTransactionProductSignals } from "~/lib/stripe-transaction-signals";
import { STRIPE_APP_SYNC_DAYS } from "~/lib/stripe-sync.constants";
import {
  parseStripeTransactionFiltersFromUrl,
  stripeTransactionsHref,
  toListStripeBalanceTransactionOptions,
  type StripeTransactionListFilters,
} from "~/lib/stripe-transactions-filters";
import { syncStripeBalanceTransactions } from "~/lib/sync-stripe-transactions.server";

const TRANSACTIONS_PATH = "/integrations/stripe/transactions";
const SUMMARY_PATH = "/integrations/stripe/transactions/summary";

function ProductCell({ tx }: { tx: StripeBalanceTransactionRecord }) {
  if (tx.productCode) {
    return (
      <span title={tx.productName ?? undefined}>
        <span className="font-mono text-dark">{tx.productCode}</span>
        {tx.productMatchStatus === "manual" && (
          <span className="ml-1 text-[10px] text-ink-faint">manual</span>
        )}
      </span>
    );
  }
  if (tx.productMatchStatus === "ambiguous") {
    return (
      <span className="text-[10px] font-medium text-amber-700">Ambiguous</span>
    );
  }
  if (
    tx.productMatchStatus === "unmatched" ||
    (!tx.productMatchStatus && !tx.productId)
  ) {
    return (
      <span className="text-[10px] font-medium text-maroon">Unmatched</span>
    );
  }
  return <span className="text-ink-faint">—</span>;
}

function communityMemberHref(tx: StripeBalanceTransactionRecord) {
  if (tx.communityMemberId) {
    return `/community/${tx.communityMemberId}`;
  }
  if (tx.memberEmail) {
    return `/community?q=${encodeURIComponent(tx.memberEmail)}`;
  }
  return null;
}

function MemberCell({ tx }: { tx: StripeBalanceTransactionRecord }) {
  const href = communityMemberHref(tx);
  if (href) {
    return (
      <Link to={href} className="text-teal hover:underline">
        <span className="block truncate text-dark">
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

function wcOrderHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/orders/${orderId}?${params}`;
}

function WcOrderCell({
  tx,
  returnTo,
}: {
  tx: StripeBalanceTransactionRecord;
  returnTo: string;
}) {
  if (tx.linkedWcOrderId) {
    return (
      <div>
        <Link
          to={wcOrderHref(tx.linkedWcOrderId, returnTo)}
          className="font-medium text-teal hover:underline"
        >
          #{tx.linkedWcOrderNumber ?? tx.linkedWcWcOrderId}
        </Link>
        <span className="mt-0.5 block text-[10px] font-medium text-jade">
          Linked
        </span>
      </div>
    );
  }
  if (tx.orderKey) {
    return (
      <div className="min-w-0" title={tx.orderKey}>
        <span className="text-[10px] text-ink-faint">No WC match</span>
        <span className="block truncate font-mono text-[10px] text-ink-muted">
          {tx.orderKey}
        </span>
      </div>
    );
  }
  return <span className="text-ink-faint">—</span>;
}

type StripeTextHintField = { label: string; value: string };

function getStripeTextHintFields(
  tx: StripeBalanceTransactionRecord,
): StripeTextHintField[] {
  const signals = extractStripeTransactionProductSignals({
    stripeRaw: tx.stripeRaw,
    description: tx.description,
    sku: tx.sku,
  });

  return [
    { label: "Description", value: signals.description },
    { label: "Line Item 1", value: signals.lineItem1 },
    { label: "Line items summary", value: signals.lineItemsSummary },
    { label: "SKU", value: signals.sku },
  ].filter((f): f is StripeTextHintField => Boolean(f.value));
}

function StripeTextHints({ fields }: { fields: StripeTextHintField[] }) {
  return (
    <div className="space-y-0.5 text-[10px] leading-snug">
      {fields.map((field) => (
        <div key={field.label} className="min-w-0 break-words">
          <span className="font-medium text-ink-faint">{field.label}: </span>
          <span className="text-ink-muted">{field.value}</span>
        </div>
      ))}
    </div>
  );
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
  const defaultAccount = connections[0]?.id ?? "";
  const filters = parseStripeTransactionFiltersFromUrl(
    url.searchParams,
    defaultAccount,
  );
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const listOptions = toListStripeBalanceTransactionOptions(filters);
  const txList = await listStripeBalanceTransactions({
    ...listOptions,
    page,
    pageSize: STRIPE_TRANSACTIONS_PAGE_SIZE,
  });

  const connectionLabels = Object.fromEntries(
    connections.map((c) => [c.id, c.label]),
  );
  const qbConnected = Boolean(await getQuickBooksTokens());

  return {
    connections,
    ...filters,
    connectionLabels,
    qbConnected,
    ...txList,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "classify") {
    const connectionId = String(form.get("connectionId") ?? "").trim() || undefined;
    const onlyUnmatched = form.get("onlyUnmatched") === "1";
    try {
      const result = await classifyAllStripeTransactions({
        stripeConnectionId: connectionId,
        onlyUnmatched,
        audit: { triggeredBy: "app", userId: user.id },
      });
      return { scope: "classify" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "classify" as const,
        error: err instanceof Error ? err.message : "Classification failed",
      };
    }
  }

  if (intent === "sync") {
    const connectionId = String(form.get("connectionId") ?? "").trim() || undefined;
    try {
      const result = await syncStripeBalanceTransactions({
        connectionId,
        days: STRIPE_APP_SYNC_DAYS,
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

  if (intent === "push-qb-bulk") {
    if (!(await getQuickBooksTokens())) {
      return {
        scope: "push-qb-bulk" as const,
        error: "Connect QuickBooks before pushing",
      };
    }
    const url = new URL(request.url);
    const connections = await listStripeConnections();
    const defaultAccount = connections[0]?.id ?? "";
    const filters = parseStripeTransactionFiltersFromUrl(
      url.searchParams,
      defaultAccount,
    );
    try {
      const { transactions } = await listAllStripeBalanceTransactions(
        toListStripeBalanceTransactionOptions(filters),
      );
      const result = await pushStripeBalanceTransactionsBulkToQuickBooks(
        transactions,
      );
      return { scope: "push-qb-bulk" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "push-qb-bulk" as const,
        error: err instanceof Error ? err.message : "Bulk push failed",
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
    product,
    connectionLabels,
    transactions,
    total,
    page,
    pageSize,
    totalPages,
    dateFrom,
    dateTo,
    period,
    wcOrderSearch,
    wcLinked,
    qbConnected,
  } = loaderData;
  const location = useLocation();

  const listFilters: StripeTransactionListFilters = {
    account,
    pushed,
    product,
    dateFrom,
    dateTo,
    period,
    wcOrderSearch,
    wcLinked,
  };
  const hasFilters =
    pushed !== "all" ||
    product !== "all" ||
    dateFrom != null ||
    dateTo != null ||
    period != null ||
    wcOrderSearch.length > 0 ||
    wcLinked !== "all";
  const unmatchedOnly = product === "unmatched";
  const summaryHref = stripeTransactionsHref(SUMMARY_PATH, listFilters);

  function filtersHref(overrides: Partial<StripeTransactionListFilters>) {
    return stripeTransactionsHref(TRANSACTIONS_PATH, { ...listFilters, ...overrides });
  }
  const returnTo = `${location.pathname}${location.search}`;
  const showAccountColumn = connections.length > 1;
  const tableColumnCount = showAccountColumn ? 11 : 10;
  const hintLeadingColSpan = showAccountColumn ? 2 : 1;
  const hintContentColSpan = tableColumnCount - hintLeadingColSpan;

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;
  const classifyResult =
    actionData?.scope === "classify" && actionData.success
      ? actionData.result
      : null;
  const classifyError =
    actionData?.scope === "classify" && actionData.error
      ? actionData.error
      : null;
  const bulkPushResult =
    actionData?.scope === "push-qb-bulk" && actionData.success
      ? actionData.result
      : null;
  const bulkPushError =
    actionData?.scope === "push-qb-bulk" && actionData.error
      ? actionData.error
      : null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const postAction = location.pathname + location.search;

  return (
    <AppPage
      title="Stripe transactions"
      description="Balance transactions synced from each connected Stripe account."
      contentClassName="min-w-0"
      actions={
        connections.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to="/integrations/stripe/transactions/quickbooks-push"
                className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
              >
                QB push
              </Link>
              <Link
                to={summaryHref}
                className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
              >
                Sales by product
              </Link>
            </div>
        ) : undefined
      }
    >
      {connections.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Form method="post" action={postAction} className="flex flex-wrap items-center gap-3">
            {account ? (
              <input type="hidden" name="connectionId" value={account} />
            ) : null}
            <SubmitButton
              intent="sync"
              variant="pill"
              loadingLabel="Syncing from Stripe…"
            >
              Sync from Stripe
            </SubmitButton>
            <span className="text-xs text-ink-faint">
              Last {STRIPE_APP_SYNC_DAYS} days
            </span>
          </Form>
          <Form method="post" action={postAction} className="flex flex-wrap items-center gap-2">
            {account ? (
              <input type="hidden" name="connectionId" value={account} />
            ) : null}
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                name="onlyUnmatched"
                value="1"
                className="rounded border-sand-dark/60"
              />
              Unmatched only
            </label>
            <SubmitButton
              intent="classify"
              variant="pill"
              loadingLabel="Classifying…"
            >
              Re-classify
            </SubmitButton>
          </Form>
          <Form method="post" action={postAction} className="flex flex-wrap items-center gap-2">
            <SubmitButton
              intent="push-qb-bulk"
              variant="pill"
              loadingLabel="Pushing to QuickBooks…"
              disabled={!qbConnected || total === 0}
            >
              Push filtered to QuickBooks
            </SubmitButton>
            <span className="text-xs text-ink-faint">
              All {total} in filter · skips rows that are not ready
            </span>
          </Form>
        </div>
      )}

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
            <li>{syncResult.skippedNotPosted} skipped (failed / not a payment)</li>
            <li>{syncResult.membersLinked} linked to community</li>
            <li>{syncResult.classified} classified for product</li>
            {syncResult.classificationSkippedManual > 0 && (
              <li>
                {syncResult.classificationSkippedManual} skipped (manual product)
              </li>
            )}
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

      {classifyResult && (
        <div
          role="status"
          className="mt-4 rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
        >
          <p className="font-medium text-dark">Classification complete</p>
          <ul className="mt-2 list-inside list-disc text-ink-muted">
            <li>{classifyResult.processed} processed</li>
            <li>{classifyResult.matched} matched</li>
            <li>{classifyResult.unmatched} unmatched</li>
            <li>{classifyResult.ambiguous} ambiguous</li>
            {classifyResult.skippedManual > 0 && (
              <li>{classifyResult.skippedManual} skipped (manual)</li>
            )}
          </ul>
        </div>
      )}

      {classifyError && (
        <p role="alert" className="mt-4 text-sm text-maroon">
          {classifyError}
        </p>
      )}

      {bulkPushError && (
        <p role="alert" className="mt-4 text-sm text-maroon">
          {bulkPushError}
        </p>
      )}

      {bulkPushResult && (
        <div
          role="status"
          className="mt-4 rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
        >
          <p className="font-medium text-dark">QuickBooks bulk push complete</p>
          <ul className="mt-2 list-inside list-disc text-ink-muted">
            <li>{bulkPushResult.matchedFilter} in current filter</li>
            <li>{bulkPushResult.pushed} pushed</li>
            <li>{bulkPushResult.skipped} skipped</li>
            {bulkPushResult.failed > 0 && (
              <li>{bulkPushResult.failed} failed (QuickBooks API)</li>
            )}
          </ul>
          {bulkPushResult.skippedSample.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-ink-muted">
                Skipped examples (
                {bulkPushResult.skipped > bulkPushResult.skippedSample.length
                  ? `showing ${bulkPushResult.skippedSample.length} of ${bulkPushResult.skipped}`
                  : bulkPushResult.skipped}
                )
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink-faint">
                {bulkPushResult.skippedSample.map((row) => (
                  <li key={row.stripeBalanceTransactionId}>
                    {row.stripeBalanceTransactionId}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {bulkPushResult.failedSample.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-maroon">
                Failed examples
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-maroon">
                {bulkPushResult.failedSample.map((row) => (
                  <li key={row.stripeBalanceTransactionId}>
                    {row.stripeBalanceTransactionId}: {row.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {connections.length > 0 && (
        <>
          <nav className="mb-3 mt-6 flex gap-3 text-xs" aria-label="Stripe views">
            <span className="font-medium text-dark">Transactions</span>
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

          <StripeTransactionsFilterForm
            account={account}
            connections={connections}
            pushed={pushed}
            product={product}
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            wcOrderSearch={wcOrderSearch}
            wcLinked={wcLinked}
          />
          <StripeTransactionsFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            product={product}
            wcOrderSearch={wcOrderSearch}
            wcLinked={wcLinked}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {!unmatchedOnly ? (
              <Link
                to={filtersHref({ product: "unmatched" })}
                className="rounded-jamyang-pill border border-maroon/40 bg-maroon/5 px-3 py-1.5 text-sm text-maroon hover:bg-maroon/10"
              >
                Unmatched only
              </Link>
            ) : (
              <Link
                to={filtersHref({ product: "all" })}
                className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm text-ink-muted hover:bg-surface"
              >
                Show all products
              </Link>
            )}
            {hasFilters && (
              <Link
                to={stripeTransactionsHref(TRANSACTIONS_PATH, {
                  ...listFilters,
                  pushed: "all",
                  product: "all",
                  dateFrom: null,
                  dateTo: null,
                  period: null,
                  wcOrderSearch: "",
                  wcLinked: "all",
                })}
                className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm text-ink-muted hover:bg-surface"
              >
                Clear filters
              </Link>
            )}
          </div>

          {unmatchedOnly && (
            <p className="mt-2 text-xs text-ink-muted">
              Showing transactions with no product assigned (including not yet
              classified).
            </p>
          )}

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
              Use Sync from Stripe to import balance transactions (last{" "}
              {STRIPE_APP_SYNC_DAYS} days).
            </p>
          ) : (
            <>
              <div className="mt-3 min-w-0 rounded-jamyang border border-sand-dark/50">
                <table className="w-full table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-[4.25rem]" />
                    {showAccountColumn ? <col className="w-[5.5rem]" /> : null}
                    <col className="w-[18%]" />
                    <col className="w-[11%]" />
                    <col className="w-[13%]" />
                    <col className="w-[10%]" />
                    <col className="w-[4.75rem]" />
                    <col className="w-[4.75rem]" />
                    <col className="w-[4.75rem]" />
                    <col className="w-[3.25rem]" />
                    <col className="w-[3.25rem]" />
                  </colgroup>
                  <thead className="bg-surface text-dark">
                    <tr>
                      <th className="px-1.5 py-1.5 font-medium">Date</th>
                      {showAccountColumn && (
                        <th className="px-1.5 py-1.5 font-medium">Account</th>
                      )}
                      <th className="px-1.5 py-1.5 font-medium">Transaction</th>
                      <th className="px-1.5 py-1.5 font-medium">WC order</th>
                      <th className="px-1.5 py-1.5 font-medium">Customer</th>
                      <th className="px-1.5 py-1.5 font-medium">Product</th>
                      <th className="px-1.5 py-1.5 font-medium text-right">Gross</th>
                      <th className="px-1.5 py-1.5 font-medium text-right">Fee</th>
                      <th className="px-1.5 py-1.5 font-medium text-right">Net</th>
                      <th className="px-1.5 py-1.5 font-medium">QB</th>
                      <th className="px-1.5 py-1.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-overlay">
                    {transactions.map((tx) => {
                      const hintFields = getStripeTextHintFields(tx);
                      const hasHints = hintFields.length > 0;

                      return (
                        <Fragment key={tx.id}>
                          <tr
                            className={`group align-top hover:bg-sand/20 ${hasHints ? "" : "border-b border-sand-dark/30"}`}
                          >
                            <td className="min-w-0 px-1.5 py-1.5 whitespace-nowrap text-ink-muted">
                              {formatCalendarDateShort(tx.stripeCreatedAt)}
                            </td>
                            {showAccountColumn && (
                              <td className="min-w-0 truncate px-1.5 py-1.5 text-dark">
                                {connectionLabels[tx.stripeConnectionId] ?? "—"}
                              </td>
                            )}
                            <td className="min-w-0 px-1.5 py-1.5">
                              <div className="capitalize text-dark">{tx.type}</div>
                              <div className="mt-0.5 break-all font-mono text-[10px] text-ink-faint select-all">
                                {tx.stripeBalanceTransactionId}
                              </div>
                              {tx.stripePaymentIntentId ? (
                                <div className="mt-0.5 break-all font-mono text-[10px] text-ink-faint select-all">
                                  {tx.stripePaymentIntentId}
                                </div>
                              ) : null}
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5">
                              <WcOrderCell tx={tx} returnTo={returnTo} />
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5">
                              <MemberCell tx={tx} />
                            </td>
                            <td className="min-w-0 truncate px-1.5 py-1.5">
                              <ProductCell tx={tx} />
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5 text-right font-mono tabular-nums text-dark whitespace-nowrap">
                              {formatMoneyMinor(tx.amount, tx.currency)}
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5 text-right font-mono tabular-nums text-ink-muted whitespace-nowrap">
                              {formatMoneyMinor(tx.fee, tx.currency)}
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5 text-right font-mono tabular-nums text-dark whitespace-nowrap">
                              {formatMoneyMinor(tx.net, tx.currency)}
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5">
                              <QuickbooksPushBadge pushed={tx.pushedToQuickbooks} />
                            </td>
                            <td className="min-w-0 px-1.5 py-1.5 text-right">
                              <Link
                                to={transactionDetailHref(tx.id, returnTo)}
                                className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                          {hasHints && (
                            <tr className="group border-b border-sand-dark/30 hover:bg-sand/20">
                              <td
                                colSpan={hintLeadingColSpan}
                                className="px-1.5 pb-2 pt-0"
                              />
                              <td
                                colSpan={hintContentColSpan}
                                className="min-w-0 px-1.5 pb-2 pt-0 align-top"
                              >
                                <StripeTextHints fields={hintFields} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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
                        to={stripeTransactionsHref(TRANSACTIONS_PATH, listFilters, page - 1)}
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
                        to={stripeTransactionsHref(TRANSACTIONS_PATH, listFilters, page + 1)}
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
