import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  buildStripeQbReconciliationSummaryRows,
  StripeQbReconciliationSummaryTable,
} from "~/components/stripe-qb-reconciliation-summary";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import { formatMoneyMinor } from "~/lib/money";
import {
  formatWooCommerceMoneyMinor,
  parseWooCommerceMoneyMinor,
} from "~/lib/woocommerce-money";
import {
  productForMatchedPair,
  sortProductGroups,
  sumMatchedQbTotals,
  sumMatchedStripeTotals,
  sumQbReceipts,
  sumStripeTransactions,
  type CurrencyTotals,
  type QbReceiptTotals,
} from "~/lib/stripe-qb-reconciliation-totals";
import type {
  StripeQbMatchedPair,
  StripeQbReconciliationByCustomer,
  StripeQbReconciliationReceipt,
  StripeQbReconciliationStripe,
  StripeQbReconciliationStripeByProduct,
  StripeQbReconciliationStripeByReason,
} from "~/lib/stripe-qb-reconciliation.server";

function stripeHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function receiptHref(receiptId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/quickbooks/sales-receipts/${receiptId}?${params}`;
}

function StripeTxnSummary({
  tx,
  returnTo,
}: {
  tx: StripeQbReconciliationStripe;
  returnTo: string;
}) {
  return (
    <Link
      to={stripeHref(tx.id, returnTo)}
      className="text-teal hover:underline"
      title={tx.stripeBalanceTransactionId}
    >
      <span className="font-mono text-[11px]">{tx.stripeBalanceTransactionId}</span>
      <span className="ml-1.5 font-sans text-xs text-dark">
        {formatMoneyMinor(tx.amount, tx.currency)} gross
      </span>
      <span className="ml-1 text-ink-muted">
        ({formatMoneyMinor(tx.net, tx.currency)} net)
      </span>
    </Link>
  );
}

function ReceiptSummary({
  receipt,
  returnTo,
}: {
  receipt: StripeQbReconciliationReceipt;
  returnTo: string;
}) {
  const currency = (receipt.currencyCode ?? "gbp").toLowerCase();
  const totalMinor =
    parseWooCommerceMoneyMinor(receipt.totalAmt, currency) ?? 0;
  return (
    <Link
      to={receiptHref(receipt.id, returnTo)}
      className="text-teal hover:underline"
    >
      <span className="font-medium text-dark">
        {receipt.docNumber ? `Receipt ${receipt.docNumber}` : receipt.quickbooksId}
      </span>
      {receipt.txnDate && (
        <span className="ml-1.5 text-ink-muted">
          {formatCalendarDateShort(receipt.txnDate)}
        </span>
      )}
      <span className="ml-1.5 font-mono text-xs text-dark">
        {formatMoneyMinor(totalMinor, currency)}
      </span>
    </Link>
  );
}

function StripeTotalsBar({
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
            {t.currency.toUpperCase()} · Stripe
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

function QbTotalsBar({
  totals,
  className = "",
}: {
  totals: QbReceiptTotals[];
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
            {t.currency.toUpperCase()} · QuickBooks
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-ink-muted">Total</dt>
              <dd className="mt-0.5 font-mono text-dark">
                {formatWooCommerceMoneyMinor(t.totalMinor, t.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Tax</dt>
              <dd className="mt-0.5 font-mono text-ink-muted">
                {formatWooCommerceMoneyMinor(t.taxMinor, t.currency)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function MatchedSubtotals({
  stripeTotals,
  qbTotals,
}: {
  stripeTotals: CurrencyTotals[];
  qbTotals: QbReceiptTotals[];
}) {
  if (stripeTotals.length === 0 && qbTotals.length === 0) return null;
  return (
    <div className="space-y-3 border-b border-sand-dark/40 bg-surface/60 px-3 py-3 sm:px-4">
      <StripeTotalsBar totals={stripeTotals} className="mb-0" />
      <QbTotalsBar totals={qbTotals} />
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

type MatchedByProductGroup = {
  productKey: string;
  productCode: string | null;
  productName: string;
  pairs: StripeQbMatchedPair[];
  stripeTotals: CurrencyTotals[];
  qbTotals: QbReceiptTotals[];
};

function groupMatchedByProduct(
  matched: StripeQbMatchedPair[],
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
        qbTotals: [],
      };
      byProduct.set(productKey, group);
    }
    group.pairs.push(pair);
  }
  for (const group of byProduct.values()) {
    group.stripeTotals = sumMatchedStripeTotals(group.pairs);
    group.qbTotals = sumMatchedQbTotals(group.pairs);
  }
  return sortProductGroups([...byProduct.values()]);
}

export function StripeQbReconciliationPanels({
  matched,
  unmatchedStripeByReason,
  unmatchedStripeByProduct,
  unmatchedQbByCustomer,
  amountMismatches,
  returnTo,
}: {
  matched: StripeQbMatchedPair[];
  unmatchedStripeByReason: StripeQbReconciliationStripeByReason[];
  unmatchedStripeByProduct: StripeQbReconciliationStripeByProduct[];
  unmatchedQbByCustomer: StripeQbReconciliationByCustomer[];
  amountMismatches: number;
  returnTo: string;
}) {
  const unmatchedStripeCount = unmatchedStripeByProduct.reduce(
    (n, g) => n + g.transactions.length,
    0,
  );
  const unmatchedQbCount = unmatchedQbByCustomer.reduce(
    (n, g) => n + g.receipts.length,
    0,
  );
  const allUnmatchedStripe = unmatchedStripeByProduct.flatMap(
    (g) => g.transactions,
  );
  const allUnmatchedQb = unmatchedQbByCustomer.flatMap((g) => g.receipts);

  const matchedByProduct = groupMatchedByProduct(matched);
  const summaryRows = buildStripeQbReconciliationSummaryRows({
    matched,
    unmatchedStripeByReason,
    unmatchedStripeByProduct,
    unmatchedQbByCustomer,
  });

  return (
    <div className="mt-6 space-y-6">
      <StripeQbReconciliationSummaryTable rows={summaryRows} />

      {amountMismatches > 0 && (
        <p className="text-sm text-amber-800">
          {amountMismatches} matched pair
          {amountMismatches === 1 ? "" : "s"} where Stripe gross does not equal
          the QuickBooks receipt total.
        </p>
      )}

      <Panel
        title="Matched"
        count={matched.length}
        description="Stripe transactions linked to a synced QuickBooks sales receipt in this period (Lotus push id or matching payment intent / tracking #)."
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
              <MatchedSubtotals
                stripeTotals={sumMatchedStripeTotals(matched)}
                qbTotals={sumMatchedQbTotals(matched)}
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
                    countLabel="pair"
                  />
                </div>
                <MatchedSubtotals
                  stripeTotals={group.stripeTotals}
                  qbTotals={group.qbTotals}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-left text-xs">
                    <thead className="bg-surface-overlay text-ink-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Stripe transaction</th>
                        <th className="px-3 py-2 font-medium">QuickBooks receipt</th>
                        <th className="px-3 py-2 font-medium">Amounts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                      {group.pairs.map(({ stripe, receipt, amountMatches }) => (
                        <tr key={stripe.id}>
                          <td className="px-3 py-2">
                            <StripeTxnSummary tx={stripe} returnTo={returnTo} />
                            {stripe.productCode && (
                              <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                                {stripe.productCode}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <ReceiptSummary receipt={receipt} returnTo={returnTo} />
                            {receipt.trackingNum && (
                              <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                                {receipt.trackingNum}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {amountMatches ? (
                              <span className="text-jade">Match</span>
                            ) : (
                              <span className="text-amber-800">Gross ≠ QB total</span>
                            )}
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
        title="Stripe — not matched"
        count={unmatchedStripeCount}
        description="Stripe transactions in this period with no synced QuickBooks sales receipt in the same period linked to them."
      >
        {unmatchedStripeCount === 0 ? (
          <p className="text-sm text-ink-muted">
            All Stripe transactions in range are matched.
          </p>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-jamyang border border-sand-dark/40">
              <div className="bg-surface px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  All unmatched
                </h3>
              </div>
              <StripeTotalsBar
                totals={sumStripeTransactions(allUnmatchedStripe)}
                className="mb-0 border-0 border-b border-sand-dark/40 rounded-none"
              />
            </section>
            {unmatchedStripeByReason.map((group) => (
              <div
                key={group.reason}
                className="overflow-hidden rounded-jamyang border border-sand-dark/40"
              >
                <div className="border-b border-sand-dark/40 bg-surface px-3 py-2 sm:px-4">
                  <h3 className="text-xs font-medium text-dark">
                    {group.reasonLabel}
                    <span className="ml-1.5 font-normal text-ink-faint">
                      ({group.transactions.length})
                    </span>
                  </h3>
                  <div className="mt-2">
                    <StripeTotalsBar totals={group.stripeTotals} className="mb-0" />
                  </div>
                </div>
                <ul className="divide-y divide-sand-dark/25 bg-surface-overlay">
                  {group.transactions.map((tx) => (
                    <li key={tx.id} className="px-3 py-2">
                      <StripeTxnSummary tx={tx} returnTo={returnTo} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
                <StripeTotalsBar
                  totals={group.stripeTotals}
                  className="mb-0 border-0 border-b border-sand-dark/40 rounded-none"
                />
                <ul className="divide-y divide-sand-dark/25 bg-surface-overlay">
                  {group.transactions.map((tx) => (
                    <li key={tx.id} className="px-3 py-2">
                      <StripeTxnSummary tx={tx} returnTo={returnTo} />
                      <span className="mt-0.5 block text-[10px] text-ink-muted">
                        {formatCalendarDateShort(tx.stripeCreatedAt.slice(0, 10))}
                        {tx.quickbooksSalesReceiptId && (
                          <span className="ml-2 font-mono text-ink-faint">
                            QB {tx.quickbooksSalesReceiptId}
                          </span>
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

      <Panel
        title="QuickBooks — not matched"
        count={unmatchedQbCount}
        description="Synced sales receipts in this period with no Stripe transaction in the same period linked to them."
      >
        {unmatchedQbCount === 0 ? (
          <p className="text-sm text-ink-muted">
            All QuickBooks receipts in range are matched.
          </p>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-jamyang border border-sand-dark/40">
              <div className="bg-surface px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  All unmatched
                </h3>
              </div>
              <QbTotalsBar
                totals={sumQbReceipts(allUnmatchedQb)}
                className="mb-0 border-0 border-b border-sand-dark/40 rounded-none"
              />
            </section>
            {unmatchedQbByCustomer.map((group) => (
              <div
                key={group.customerKey}
                className="overflow-hidden rounded-jamyang border border-sand-dark/40"
              >
                <div className="bg-surface px-3 py-2 sm:px-4">
                  <h3 className="text-xs font-medium text-dark">
                    {group.customerName}
                    <span className="ml-1.5 font-normal text-ink-faint">
                      ({group.receipts.length} receipt
                      {group.receipts.length === 1 ? "" : "s"})
                    </span>
                  </h3>
                </div>
                <QbTotalsBar
                  totals={group.qbTotals}
                  className="mb-0 border-0 border-b border-sand-dark/40 rounded-none"
                />
                <ul className="divide-y divide-sand-dark/25 bg-surface-overlay">
                  {group.receipts.map((receipt) => (
                    <li key={receipt.id} className="px-3 py-2">
                      <ReceiptSummary receipt={receipt} returnTo={returnTo} />
                      {receipt.privateNote && (
                        <span className="mt-0.5 block text-[10px] text-ink-muted truncate">
                          {receipt.privateNote}
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
    </div>
  );
}
