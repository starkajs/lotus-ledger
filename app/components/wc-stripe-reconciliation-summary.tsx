import { formatMoneyMinor } from "~/lib/money";
import type {
  CurrencyTotals,
  WcOrderTotals,
} from "~/lib/wc-stripe-reconciliation-totals";
import {
  productForMatchedPair,
  sortProductGroups,
  sumMatchedStripeTotals,
  sumMatchedWcOrderTotals,
  sumStripeTransactions,
  sumWcOrders,
} from "~/lib/wc-stripe-reconciliation-totals";
import type {
  WcStripeMatchedPair,
  WcStripeReconciliationByProduct,
  WcStripeReconciliationByStatus,
  WcStripeReconciliationWcByProduct,
} from "~/lib/wc-stripe-reconciliation.server";

export type SummaryRow = {
  section: string;
  groupLabel: string;
  productCode: string | null;
  count: number;
  stripeTotals: CurrencyTotals[];
  wcTotals: WcOrderTotals[];
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
            <span className="text-[10px] uppercase text-ink-faint mr-1">
              {t.currency}
            </span>
            {formatMoneyMinor(t.grossMinor, t.currency)}
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div key={`f-${t.currency}`} className="font-mono text-ink-muted whitespace-nowrap">
            <span className="text-[10px] uppercase text-ink-faint mr-1">
              {t.currency}
            </span>
            {formatMoneyMinor(t.feeMinor, t.currency)}
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {totals.map((t) => (
          <div key={`n-${t.currency}`} className="font-mono text-dark whitespace-nowrap">
            <span className="text-[10px] uppercase text-ink-faint mr-1">
              {t.currency}
            </span>
            {formatMoneyMinor(t.netMinor, t.currency)}
          </div>
        ))}
      </td>
    </>
  );
}

function WcMoneyCell({ totals }: { totals: WcOrderTotals[] }) {
  if (totals.length === 0) {
    return <td className="px-3 py-2 text-right text-ink-faint">—</td>;
  }
  return (
    <td className="px-3 py-2 text-right align-top">
      {totals.map((t) => (
        <div key={t.currency} className="font-mono text-dark whitespace-nowrap">
          <span className="text-[10px] uppercase text-ink-faint mr-1">
            {t.currency}
          </span>
          {formatMoneyMinor(t.totalMinor, t.currency)}
        </div>
      ))}
    </td>
  );
}

export function buildReconciliationSummaryRows(input: {
  matched: WcStripeMatchedPair[];
  unmatchedWcByStatus: WcStripeReconciliationByStatus[];
  unmatchedWcByProduct: WcStripeReconciliationWcByProduct[];
  unmatchedStripeByProduct: WcStripeReconciliationByProduct[];
}): SummaryRow[] {
  const rows: SummaryRow[] = [];

  const matchedByProduct = sortProductGroups(
    (() => {
      const byProduct = new Map<
        string,
        {
          productKey: string;
          productCode: string | null;
          productName: string;
          pairs: WcStripeMatchedPair[];
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
      wcTotals: sumMatchedWcOrderTotals(group.pairs),
    });
  }
  if (input.matched.length > 0) {
    rows.push({
      section: "Matched",
      groupLabel: "Section total",
      productCode: null,
      count: input.matched.length,
      stripeTotals: sumMatchedStripeTotals(input.matched),
      wcTotals: sumMatchedWcOrderTotals(input.matched),
      isSectionTotal: true,
    });
  }

  for (const group of input.unmatchedWcByProduct) {
    rows.push({
      section: "WC — not matched",
      groupLabel: group.productName,
      productCode: group.productCode,
      count: group.orders.length,
      stripeTotals: [],
      wcTotals: group.wcTotals,
    });
  }
  const allUnmatchedWc = input.unmatchedWcByStatus.flatMap((g) => g.orders);
  if (allUnmatchedWc.length > 0) {
    rows.push({
      section: "WC — not matched",
      groupLabel: "Section total",
      productCode: null,
      count: allUnmatchedWc.length,
      stripeTotals: [],
      wcTotals: sumWcOrders(allUnmatchedWc),
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
      wcTotals: [],
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
      wcTotals: [],
      isSectionTotal: true,
    });
  }

  return rows;
}

export function WcStripeReconciliationSummaryTable({
  rows,
}: {
  rows: SummaryRow[];
}) {
  if (rows.length === 0) return null;

  let lastSection = "";

  return (
    <section className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
      <header className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Summary</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Totals by section and Lotus product (or WC status grouping in detail
          views). Stripe amounts are gross, fee, and net.
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
            <th className="px-3 py-2 font-medium text-right">WC order total</th>
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
                  ) : (
                    <ProductLabel code={row.productCode} name={row.groupLabel} />
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {row.count}
                </td>
                <StripeMoneyCells totals={row.stripeTotals} />
                <WcMoneyCell totals={row.wcTotals} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
