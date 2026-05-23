import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  buildReconciliationSummaryRows,
  WcStripeReconciliationSummaryTable,
} from "~/components/wc-stripe-reconciliation-summary";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import { formatMoneyMinor } from "~/lib/money";
import {
  productForMatchedPair,
  sortProductGroups,
  sumMatchedStripeTotals,
  sumMatchedWcOrderTotals,
  sumStripeTransactions,
  sumWcOrders,
  type CurrencyTotals,
  type WcOrderTotals,
} from "~/lib/wc-stripe-reconciliation-totals";
import type {
  WcStripeMatchedPair,
  WcStripeReconciliationByProduct,
  WcStripeReconciliationByStatus,
  WcStripeReconciliationOrder,
  WcStripeReconciliationStripe,
  WcStripeReconciliationWcByProduct,
} from "~/lib/wc-stripe-reconciliation.server";

function orderHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/orders/${orderId}?${params}`;
}

function stripeHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function OrderSummary({
  order,
  returnTo,
}: {
  order: WcStripeReconciliationOrder;
  returnTo: string;
}) {
  return (
    <Link
      to={orderHref(order.id, returnTo)}
      className="text-teal hover:underline"
    >
      <span className="font-medium text-dark">
        #{order.orderNumber ?? order.wcOrderId}
      </span>
      <span className="ml-1.5 text-ink-muted">
        {formatCalendarDateShort(order.dateCreated.slice(0, 10))}
      </span>
      <span className="ml-1.5 font-mono text-xs text-dark">
        {formatMoneyMinor(order.totalMinor, order.currency)}
      </span>
      {order.lotusProductCode && (
        <span className="ml-1.5 font-mono text-[10px] text-ink-muted">
          {order.lotusProductCode}
        </span>
      )}
    </Link>
  );
}

function StripeTxnSummary({
  tx,
  returnTo,
}: {
  tx: WcStripeReconciliationStripe;
  returnTo: string;
}) {
  return (
    <Link
      to={stripeHref(tx.id, returnTo)}
      className="font-mono text-[11px] text-teal hover:underline"
      title={tx.stripeBalanceTransactionId}
    >
      {tx.stripeBalanceTransactionId}
      <span className="ml-1.5 font-sans text-xs text-dark">
        {formatMoneyMinor(tx.amount, tx.currency)} gross
      </span>
      <span className="ml-1 text-ink-muted">
        ({formatMoneyMinor(tx.net, tx.currency)} net)
      </span>
    </Link>
  );
}

type MatchedByProductGroup = {
  productKey: string;
  productCode: string | null;
  productName: string;
  pairs: WcStripeMatchedPair[];
  stripeTotals: CurrencyTotals[];
  wcTotals: WcOrderTotals[];
};

function groupMatchedByProduct(
  matched: WcStripeMatchedPair[],
): MatchedByProductGroup[] {
  const byProduct = new Map<string, MatchedByProductGroup>();
  for (const pair of matched) {
    const { productKey, productCode, productName } = productForMatchedPair(pair);
    let group = byProduct.get(productKey);
    if (!group) {
      group = {
        productKey,
        productCode,
        productName,
        pairs: [],
        stripeTotals: [],
        wcTotals: [],
      };
      byProduct.set(productKey, group);
    }
    group.pairs.push(pair);
  }
  for (const group of byProduct.values()) {
    group.stripeTotals = sumMatchedStripeTotals(group.pairs);
    group.wcTotals = sumMatchedWcOrderTotals(group.pairs);
  }
  return sortProductGroups([...byProduct.values()]);
}

function MatchedStripeTotals({
  totals,
  className = "mb-4",
}: {
  totals: CurrencyTotals[];
  className?: string;
}) {
  if (totals.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap gap-6 rounded-jamyang border border-sand-dark/40 bg-surface px-4 py-3 ${className}`.trim()}
    >
      {totals.map((t) => (
        <div key={t.currency} className="min-w-[10rem]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            {t.currency.toUpperCase()}
          </p>
          <dl className="mt-1 grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-ink-muted">Gross</dt>
              <dd className="mt-0.5 font-mono text-dark">
                {formatMoneyMinor(t.grossMinor, t.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Fee</dt>
              <dd className="mt-0.5 font-mono text-ink-muted">
                {formatMoneyMinor(t.feeMinor, t.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Net</dt>
              <dd className="mt-0.5 font-mono text-dark">
                {formatMoneyMinor(t.netMinor, t.currency)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function MatchedWcOrderTotals({
  totals,
  className = "",
}: {
  totals: WcOrderTotals[];
  className?: string;
}) {
  if (totals.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap gap-6 rounded-jamyang border border-sand-dark/40 bg-surface px-4 py-3 ${className}`.trim()}
    >
      {totals.map((t) => (
        <div key={t.currency} className="min-w-[10rem]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            {t.currency.toUpperCase()}
          </p>
          <dl className="mt-1 text-xs">
            <div>
              <dt className="text-ink-muted">Order total</dt>
              <dd className="mt-0.5 font-mono text-dark">
                {formatMoneyMinor(t.totalMinor, t.currency)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function MatchedGroupSubtotals({
  stripeTotals,
  wcTotals,
}: {
  stripeTotals: CurrencyTotals[];
  wcTotals: WcOrderTotals[];
}) {
  if (stripeTotals.length === 0 && wcTotals.length === 0) return null;

  return (
    <div className="space-y-3 border-b border-sand-dark/40 bg-surface/60 px-3 py-3 sm:px-4">
      {stripeTotals.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            Stripe
          </p>
          <MatchedStripeTotals totals={stripeTotals} className="mb-0" />
        </div>
      )}
      {wcTotals.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            WooCommerce
          </p>
          <MatchedWcOrderTotals totals={wcTotals} />
        </div>
      )}
    </div>
  );
}

function ProductGroupHeading({
  productCode,
  productName,
  count,
  countLabel,
}: {
  productCode: string | null;
  productName: string;
  count: number;
  countLabel: string;
}) {
  return (
    <h3 className="text-xs font-medium text-dark">
      {productCode ? (
        <>
          <span className="font-mono">{productCode}</span>
          <span className="ml-1.5 font-normal text-ink-muted">{productName}</span>
        </>
      ) : (
        <span className="text-maroon">{productName}</span>
      )}
      <span className="ml-1.5 font-normal text-ink-faint">
        ({count} {countLabel}
        {count === 1 ? "" : "s"})
      </span>
    </h3>
  );
}

function Panel({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count: number;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
      <header className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-medium text-dark">
          {title}
          <span className="ml-2 font-normal text-ink-muted">({count})</span>
        </h2>
        {description && (
          <p className="mt-1 text-xs text-ink-muted">{description}</p>
        )}
      </header>
      <div className="px-4 py-3 sm:px-6">{children}</div>
    </section>
  );
}

export function WcStripeReconciliationPanels({
  matched,
  unmatchedWcByStatus,
  unmatchedWcByProduct,
  unmatchedStripeByProduct,
  returnTo,
}: {
  matched: WcStripeMatchedPair[];
  unmatchedWcByStatus: WcStripeReconciliationByStatus[];
  unmatchedWcByProduct: WcStripeReconciliationWcByProduct[];
  unmatchedStripeByProduct: WcStripeReconciliationByProduct[];
  returnTo: string;
}) {
  const unmatchedWcCount = unmatchedWcByStatus.reduce(
    (n, g) => n + g.orders.length,
    0,
  );
  const unmatchedStripeCount = unmatchedStripeByProduct.reduce(
    (n, g) => n + g.transactions.length,
    0,
  );
  const allUnmatchedWc = unmatchedWcByStatus.flatMap((g) => g.orders);
  const allUnmatchedStripe = unmatchedStripeByProduct.flatMap(
    (g) => g.transactions,
  );

  const matchedStripeTotals = sumMatchedStripeTotals(matched);
  const matchedWcTotals = sumMatchedWcOrderTotals(matched);
  const matchedByProduct = groupMatchedByProduct(matched);
  const unmatchedWcTotals = sumWcOrders(allUnmatchedWc);
  const unmatchedStripeTotals = sumStripeTransactions(allUnmatchedStripe);

  const summaryRows = buildReconciliationSummaryRows({
    matched,
    unmatchedWcByStatus,
    unmatchedWcByProduct,
    unmatchedStripeByProduct,
  });

  return (
    <div className="mt-6 space-y-6">
      <WcStripeReconciliationSummaryTable rows={summaryRows} />

      <Panel
        title="Matched"
        count={matched.length}
        description="Linked WC orders and Stripe transactions in this period, grouped by Lotus product (Stripe classification takes priority)."
      >
        {matched.length === 0 ? (
          <p className="text-sm text-ink-muted">No matched pairs in this period.</p>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-jamyang border border-sand-dark/40">
              <div className="bg-surface px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  All matched
                </h3>
              </div>
              <MatchedGroupSubtotals
                stripeTotals={matchedStripeTotals}
                wcTotals={matchedWcTotals}
              />
            </section>
            {matchedByProduct.map((group) => (
              <section
                key={group.productKey}
                className="overflow-hidden rounded-jamyang border border-sand-dark/40"
              >
                <div className="bg-surface px-3 py-2 sm:px-4">
                  <ProductGroupHeading
                    productCode={group.productCode}
                    productName={group.productName}
                    count={group.pairs.length}
                    countLabel="order"
                  />
                </div>
                <MatchedGroupSubtotals
                  stripeTotals={group.stripeTotals}
                  wcTotals={group.wcTotals}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-left text-xs">
                    <thead className="bg-surface-overlay text-ink-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">WooCommerce order</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Stripe transaction(s)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                      {group.pairs.map(({ order, stripeTransactions }) => (
                        <tr key={order.id}>
                          <td className="px-3 py-2">
                            <OrderSummary order={order} returnTo={returnTo} />
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{order.status}</td>
                          <td className="px-3 py-2 space-y-1">
                            {stripeTransactions.map((tx) => (
                              <div key={tx.id}>
                                <StripeTxnSummary tx={tx} returnTo={returnTo} />
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="WooCommerce — not matched"
        count={unmatchedWcCount}
        description="Orders in this period with no Stripe transaction in the same period linked to them. Listed by status; summary uses Lotus product."
      >
        {unmatchedWcCount === 0 ? (
          <p className="text-sm text-ink-muted">All WC orders in range are matched.</p>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-jamyang border border-sand-dark/40">
              <div className="bg-surface px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  All unmatched orders
                </h3>
              </div>
              <div className="border-b border-sand-dark/40 bg-surface/60 px-3 py-3 sm:px-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  WooCommerce
                </p>
                <MatchedWcOrderTotals totals={unmatchedWcTotals} />
              </div>
            </section>
            {unmatchedWcByStatus.map((group) => (
              <div
                key={group.status}
                className="overflow-hidden rounded-jamyang border border-sand-dark/40"
              >
                <div className="border-b border-sand-dark/40 bg-surface px-3 py-2 sm:px-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {group.status}
                    <span className="ml-1.5 font-normal normal-case text-ink-faint">
                      ({group.orders.length} order
                      {group.orders.length === 1 ? "" : "s"})
                    </span>
                  </h3>
                  <div className="mt-2">
                    <MatchedWcOrderTotals
                      totals={group.wcTotals}
                      className="mb-0 border-0 bg-transparent px-0 py-0"
                    />
                  </div>
                </div>
                <ul className="divide-y divide-sand-dark/25 bg-surface-overlay">
                  {group.orders.map((order) => (
                    <li key={order.id} className="px-3 py-2 text-sm">
                      <OrderSummary order={order} returnTo={returnTo} />
                      {order.orderKey && (
                        <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                          {order.orderKey}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Stripe — not matched"
        count={unmatchedStripeCount}
        description="Stripe transactions in this period with no WooCommerce order in the same period linked to them, grouped by Lotus product."
      >
        {unmatchedStripeCount === 0 ? (
          <p className="text-sm text-ink-muted">All Stripe transactions in range are matched.</p>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-jamyang border border-sand-dark/40">
              <div className="bg-surface px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  All unmatched transactions
                </h3>
              </div>
              <MatchedGroupSubtotals
                stripeTotals={unmatchedStripeTotals}
                wcTotals={[]}
              />
            </section>
            {unmatchedStripeByProduct.map((group) => (
              <div
                key={group.productKey}
                className="overflow-hidden rounded-jamyang border border-sand-dark/40"
              >
                <div className="bg-surface px-3 py-2 sm:px-4">
                  <ProductGroupHeading
                    productCode={group.productCode}
                    productName={group.productName}
                    count={group.transactions.length}
                    countLabel="transaction"
                  />
                </div>
                <MatchedGroupSubtotals
                  stripeTotals={group.stripeTotals}
                  wcTotals={[]}
                />
                <ul className="divide-y divide-sand-dark/25 bg-surface-overlay">
                  {group.transactions.map((tx) => (
                    <li key={tx.id} className="px-3 py-2">
                      <StripeTxnSummary tx={tx} returnTo={returnTo} />
                      <span className="mt-0.5 block text-[10px] text-ink-muted">
                        {formatCalendarDateShort(tx.stripeCreatedAt.slice(0, 10))}
                        {tx.orderKey && (
                          <span className="ml-2 font-mono">{tx.orderKey}</span>
                        )}
                        {tx.wcOrderId != null && (
                          <span className="ml-2">wc:{tx.wcOrderId}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
