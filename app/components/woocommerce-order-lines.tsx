import type { WooCommerceOrderLineItem } from "~/db/schema";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

export function WooCommerceOrderLines({
  lineItems,
  lineSummary,
  currency,
}: {
  lineItems: WooCommerceOrderLineItem[];
  lineSummary: string | null;
  currency: string;
}) {
  if (lineItems.length === 0) {
    if (!lineSummary?.trim()) {
      return <p className="text-sm text-ink-faint">No line items recorded.</p>;
    }
    return (
      <p className="text-sm text-ink-muted">
        <span className="text-ink-faint">Summary: </span>
        {lineSummary}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-jamyang border border-sand-dark/40">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead className="bg-surface text-ink-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">Product</th>
            <th className="px-3 py-1.5 font-medium">SKU</th>
            <th className="px-3 py-1.5 font-medium text-right">Qty</th>
            <th className="px-3 py-1.5 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
          {lineItems.map((line) => (
            <tr key={line.id}>
              <td className="px-3 py-1.5 text-dark">{line.name}</td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-ink-muted">
                {line.sku ?? "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                {line.quantity}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                {line.totalMinor != null
                  ? formatWooCommerceMoneyMinor(line.totalMinor, currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
