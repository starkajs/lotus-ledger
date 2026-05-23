import { formatMoneyMinor } from "~/lib/money";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import type {
  CurrencyTotals,
  QbReceiptTotals,
} from "~/lib/stripe-qb-reconciliation-totals";
import {
  productForMatchedPair,
  sortProductGroups,
  sumMatchedQbTotals,
  sumMatchedStripeTotals,
  sumQbReceipts,
  sumStripeTransactions,
} from "~/lib/stripe-qb-reconciliation-totals";
import type {
  StripeQbMatchedPair,
  StripeQbReconciliationByCustomer,
  StripeQbReconciliationStripeByProduct,
  StripeQbReconciliationStripeByReason,
} from "~/lib/stripe-qb-reconciliation.server";

export type StripeQbSummaryRow = {
  section: string;
  groupLabel: string;
  productCode: string | null;
  count: number;
  stripeTotals: CurrencyTotals[];
  qbTotals: QbReceiptTotals[];
  isSectionTotal?: boolean;
};

function ProductLabel({
  code,
  name,
}: {
  code: string | null;
  name: string;
}) {
  if (!code) {
    return <span className="text-maroon">{name}</span>;
  }
  return (
    <>
      <span className="font-mono">{code}</span>
      <span className="ml-1.5 font-normal text-ink-muted">{name}</span>
    </>
  );
}

function StripeMoneyCells({ totals }: { totals: CurrencyTotals[] }) {
  if (totals.length === 0) {
    return (
      <>
        <td className="px-3 py-2 text-right text-ink-faint">—</td>
        <td className="px-3 py-2 text-right text-ink-faint">—</td>
        <td className="px-3 py-2 text-right text-ink-faint">—</td>
      </>
    );
  }
  return (
    <>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div key={`g-${t.currency}`} className="font-mono text-dark whitespace-nowrap">
            <span className="mr-1 text-[10px] uppercase text-ink-faint">
              {t.currency}
            </span>
            {formatMoneyMinor(t.grossMinor, t.currency)}
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div
            key={`f-${t.currency}`}
            className="font-mono text-ink-muted whitespace-nowrap"
          >
            <span className="mr-1 text-[10px] uppercase text-ink-faint">
              {t.currency}
            </span>
            {formatMoneyMinor(t.feeMinor, t.currency)}
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div key={`n-${t.currency}`} className="font-mono text-dark whitespace-nowrap">
            <span className="mr-1 text-[10px] uppercase text-ink-faint">
              {t.currency}
            </span>
            {formatMoneyMinor(t.netMinor, t.currency)}
          </div>
        ))}
      </td>
    </>
  );
}

function QbMoneyCells({ totals }: { totals: QbReceiptTotals[] }) {
  if (totals.length === 0) {
    return (
      <>
        <td className="px-3 py-2 text-right text-ink-faint">—</td>
        <td className="px-3 py-2 text-right text-ink-faint">—</td>
      </>
    );
  }
  return (
    <>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div key={`t-${t.currency}`} className="font-mono text-dark whitespace-nowrap">
            <span className="mr-1 text-[10px] uppercase text-ink-faint">
              {t.currency}
            </span>
            {formatWooCommerceMoneyMinor(t.totalMinor, t.currency)}
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div
            key={`tax-${t.currency}`}
            className="font-mono text-ink-muted whitespace-nowrap"
          >
            <span className="mr-1 text-[10px] uppercase text-ink-faint">
              {t.currency}
            </span>
            {formatWooCommerceMoneyMinor(t.taxMinor, t.currency)}
          </div>
        ))}
      </td>
    </>
  );
}

export function buildStripeQbReconciliationSummaryRows(input: {
  matched: StripeQbMatchedPair[];
  unmatchedStripeByReason: StripeQbReconciliationStripeByReason[];
  unmatchedStripeByProduct: StripeQbReconciliationStripeByProduct[];
  unmatchedQbByCustomer: StripeQbReconciliationByCustomer[];
}): StripeQbSummaryRow[] {
  const rows: StripeQbSummaryRow[] = [];

  const matchedByProduct = sortProductGroups(
    (() => {
      const byProduct = new Map<
        string,
        {
          productKey: string;
          productCode: string | null;
          productName: string;
          pairs: StripeQbMatchedPair[];
        }
      >();
      for (const pair of input.matched) {
        const { productKey, productCode, productName } = productForMatchedPair(pair);
        let group = byProduct.get(productKey);
        if (!group) {
          group = { productKey, productCode, productName, pairs: [] };
          byProduct.set(productKey, group);
        }
        group.pairs.push(pair);
      }
      return [...byProduct.values()];
    })(),
  );

  for (const group of matchedByProduct) {
    rows.push({
      section: "Matched",
      groupLabel: group.productName,
      productCode: group.productCode,
      count: group.pairs.length,
      stripeTotals: sumMatchedStripeTotals(group.pairs),
      qbTotals: sumMatchedQbTotals(group.pairs),
    });
  }
  if (input.matched.length > 0) {
    rows.push({
      section: "Matched",
      groupLabel: "Section total",
      productCode: null,
      count: input.matched.length,
      stripeTotals: sumMatchedStripeTotals(input.matched),
      qbTotals: sumMatchedQbTotals(input.matched),
      isSectionTotal: true,
    });
  }

  for (const group of input.unmatchedStripeByProduct) {
    rows.push({
      section: "Stripe — not matched",
      groupLabel: group.productName,
      productCode: group.productCode,
      count: group.transactions.length,
      stripeTotals: group.stripeTotals,
      qbTotals: [],
    });
  }
  const allUnmatchedStripe = input.unmatchedStripeByProduct.flatMap(
    (g) => g.transactions,
  );
  if (allUnmatchedStripe.length > 0) {
    rows.push({
      section: "Stripe — not matched",
      groupLabel: "Section total",
      productCode: null,
      count: allUnmatchedStripe.length,
      stripeTotals: sumStripeTransactions(allUnmatchedStripe),
      qbTotals: [],
      isSectionTotal: true,
    });
  }

  for (const group of input.unmatchedQbByCustomer) {
    rows.push({
      section: "QuickBooks — not matched",
      groupLabel: group.customerName,
      productCode: null,
      count: group.receipts.length,
      stripeTotals: [],
      qbTotals: group.qbTotals,
    });
  }
  const allUnmatchedQb = input.unmatchedQbByCustomer.flatMap((g) => g.receipts);
  if (allUnmatchedQb.length > 0) {
    rows.push({
      section: "QuickBooks — not matched",
      groupLabel: "Section total",
      productCode: null,
      count: allUnmatchedQb.length,
      stripeTotals: [],
      qbTotals: sumQbReceipts(allUnmatchedQb),
      isSectionTotal: true,
    });
  }

  return rows;
}

export function StripeQbReconciliationSummaryTable({
  rows,
}: {
  rows: StripeQbSummaryRow[];
}) {
  if (rows.length === 0) return null;

  let lastSection = "";

  return (
    <section className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
      <header className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Summary</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Stripe balance transactions (by Stripe date) vs synced QuickBooks sales
          receipts (by QB txn date) in Lotus Ledger only.
        </p>
      </header>
      <table className="w-full min-w-[56rem] text-left text-xs">
        <thead className="bg-surface text-dark">
          <tr>
            <th className="px-3 py-2 font-medium">Section</th>
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 font-medium text-right">Count</th>
            <th className="px-3 py-2 font-medium text-right">Stripe gross</th>
            <th className="px-3 py-2 font-medium text-right">Stripe fee</th>
            <th className="px-3 py-2 font-medium text-right">Stripe net</th>
            <th className="px-3 py-2 font-medium text-right">QB total</th>
            <th className="px-3 py-2 font-medium text-right">QB tax</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-dark/30">
          {rows.map((row, index) => {
            const showSection = row.section !== lastSection;
            lastSection = row.section;
            return (
              <tr
                key={`${row.section}-${row.groupLabel}-${index}`}
                className={
                  row.isSectionTotal
                    ? "bg-surface font-medium"
                    : "bg-surface-overlay"
                }
              >
                <td className="px-3 py-2 text-dark">
                  {showSection ? row.section : ""}
                </td>
                <td className="px-3 py-2">
                  {row.isSectionTotal ? (
                    <span className="text-ink-muted">{row.groupLabel}</span>
                  ) : row.productCode != null || row.section.startsWith("Stripe") ? (
                    <ProductLabel code={row.productCode} name={row.groupLabel} />
                  ) : (
                    <span className="text-dark">{row.groupLabel}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {row.count}
                </td>
                <StripeMoneyCells totals={row.stripeTotals} />
                <QbMoneyCells totals={row.qbTotals} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
