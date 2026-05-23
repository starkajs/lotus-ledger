import { Link } from "react-router";
import { formatMoneyMinor } from "~/lib/money";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import type { LinkedStripeTransactionSummary } from "~/lib/wc-stripe-order-link";

export function LinkedStripeTransactionsTable({
  transactions,
  returnTo,
}: {
  transactions: LinkedStripeTransactionSummary[];
  returnTo: string;
}) {
  if (transactions.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-jamyang border border-sand-dark/40">
      <table className="w-full min-w-[40rem] text-left text-xs">
        <thead className="bg-surface text-ink-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">Transaction</th>
            <th className="px-3 py-1.5 font-medium">Date</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Product</th>
            <th className="px-3 py-1.5 font-medium">CCY</th>
            <th className="px-3 py-1.5 font-medium text-right">Gross</th>
            <th className="px-3 py-1.5 font-medium text-right">Fee</th>
            <th className="px-3 py-1.5 font-medium text-right">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td className="px-3 py-1.5">
                <Link
                  to={`/integrations/stripe/transactions/${tx.id}?returnTo=${encodeURIComponent(returnTo)}`}
                  className="font-mono text-[10px] text-teal hover:underline"
                >
                  {tx.stripeBalanceTransactionId}
                </Link>
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-ink-muted">
                {formatCalendarDateShort(tx.stripeCreatedAt)}
              </td>
              <td className="px-3 py-1.5 capitalize text-dark">{tx.type}</td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-ink-muted">
                {tx.productCode ?? "—"}
              </td>
              <td className="px-3 py-1.5 font-mono text-[10px] uppercase text-ink-muted">
                {tx.currency}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                {formatMoneyMinor(tx.amount, tx.currency)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-ink-muted whitespace-nowrap">
                {formatMoneyMinor(tx.fee, tx.currency)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                {formatMoneyMinor(tx.net, tx.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
