import { Fragment } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions.summary";
import { AppPage } from "~/components/app-page";
import {
  StripeTransactionsFilterForm,
  StripeTransactionsFilterSummary,
} from "~/components/stripe-transactions-filter-form";
import { formatMoneyMinor } from "~/lib/money";
import { requireUser } from "~/lib/session.server";
import {
  aggregateStripeTransactionsByProduct,
  type StripeLotusProductAggregate,
} from "~/lib/stripe-balance-transactions.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import {
  parseStripeTransactionFiltersFromUrl,
  stripeTransactionsHref,
  toListStripeBalanceTransactionOptions,
  type StripeTransactionListFilters,
} from "~/lib/stripe-transactions-filters";

const TRANSACTIONS_PATH = "/integrations/stripe/transactions";
const SUMMARY_PATH = "/integrations/stripe/transactions/summary";

function MoneyTotals({
  totals,
}: {
  totals: {
    currency: string;
    grossMinor: number;
    feeMinor: number;
    netMinor: number;
  }[];
}) {
  if (totals.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-3 font-mono">
      {totals.map((t) => (
        <span key={t.currency} title={`Gross / fee / net (${t.currency.toUpperCase()})`}>
          {formatMoneyMinor(t.grossMinor, t.currency)}
          <span className="text-ink-faint"> / </span>
          {formatMoneyMinor(t.feeMinor, t.currency)}
          <span className="text-ink-faint"> / </span>
          {formatMoneyMinor(t.netMinor, t.currency)}
        </span>
      ))}
    </span>
  );
}

function LotusGroupHeader({ group }: { group: StripeLotusProductAggregate }) {
  if (group.unmapped) {
    return <span className="font-medium text-dark">{group.name}</span>;
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
    { title: "Stripe sales by product — Lotus Ledger" },
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

  const aggregation = await aggregateStripeTransactionsByProduct(
    toListStripeBalanceTransactionOptions(filters),
  );

  return {
    connections,
    ...aggregation,
    ...filters,
  };
}

export default function StripeTransactionsSummaryPage({
  loaderData,
}: Route.ComponentProps) {
  const {
    connections,
    transactionCount,
    groups,
    grandTotals,
    account,
    pushed,
    product,
    dateFrom,
    dateTo,
    period,
  } = loaderData;

  const listFilters: StripeTransactionListFilters = {
    account,
    pushed,
    product,
    dateFrom,
    dateTo,
    period,
  };

  const transactionsListHref = stripeTransactionsHref(
    TRANSACTIONS_PATH,
    listFilters,
  );

  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <AppPage
      title="Sales by product"
      description="Stripe balance transactions grouped by Lotus product and line signals."
      actions={
        connections.length > 0 ? (
          <Link
            to={transactionsListHref}
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Transaction list
          </Link>
        ) : undefined
      }
    >
      {connections.length === 0 ? (
        <p
          role="status"
          className="rounded-jamyang border border-sand-dark/50 bg-sand/30 p-4 text-sm text-ink-muted"
        >
          Add a Stripe account under{" "}
          <Link to="/integrations/stripe" className="text-teal underline">
            Stripe integrations
          </Link>{" "}
          before viewing sales.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            <Link to="/integrations/stripe" className="text-teal underline">
              Stripe settings
            </Link>
          </p>

          <nav className="mb-3 mt-4 flex gap-3 text-xs" aria-label="Stripe views">
            <Link
              to={transactionsListHref}
              className="text-ink-muted hover:text-teal hover:underline"
            >
              Transactions
            </Link>
            <span className="text-ink-faint" aria-hidden>
              /
            </span>
            <span className="font-medium text-dark">Sales by product</span>
          </nav>

          <StripeTransactionsFilterForm
            account={account}
            connections={connections}
            pushed={pushed}
            product={product}
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            action={SUMMARY_PATH}
          />
          <StripeTransactionsFilterSummary
            dateFrom={dateFrom}
            dateTo={dateTo}
            period={period}
            product={product}
          />

          <p className="mt-3 text-xs text-ink-muted">
            {transactionCount === 0
              ? "No transactions in this period."
              : `${transactionCount} transaction${transactionCount === 1 ? "" : "s"} · ${lineCount} line${lineCount === 1 ? "" : "s"}`}
            {grandTotals.length > 0 && (
              <span className="text-ink-faint">
                {" "}
                · Total <MoneyTotals totals={grandTotals} />
              </span>
            )}
          </p>

          {groups.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              No transactions to aggregate for the selected filters.
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
                    <div className="text-xs text-dark">
                      <MoneyTotals totals={group.subtotals} />
                    </div>
                  </div>
                  <table className="w-full min-w-[40rem] text-left text-xs">
                    <thead className="bg-surface-overlay text-ink-muted">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Line</th>
                        <th className="px-3 py-1.5 font-medium text-right">Count</th>
                        <th className="px-3 py-1.5 font-medium">CCY</th>
                        <th className="px-3 py-1.5 font-medium text-right">Gross</th>
                        <th className="px-3 py-1.5 font-medium text-right">Fee</th>
                        <th className="px-3 py-1.5 font-medium text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface-overlay">
                      {group.lines.map((line) => (
                        <tr
                          key={`${line.label}-${line.currency}`}
                          className="border-t border-sand-dark/30"
                        >
                          <td className="px-3 py-1.5 text-dark">{line.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                            {line.count}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[10px] uppercase text-ink-muted">
                            {line.currency}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                            {formatMoneyMinor(line.grossMinor, line.currency)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-ink-muted whitespace-nowrap">
                            {formatMoneyMinor(line.feeMinor, line.currency)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                            {formatMoneyMinor(line.netMinor, line.currency)}
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
