import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ReconciliationDetailGroup,
  ReconciliationDetailList,
} from "~/components/reconciliation-detail-group";
import { formatCalendarDateShort } from "~/lib/date-range-filters";
import { formatMoneyMinor } from "~/lib/money";
import type {
  QbPushedDuplicate,
  QbPushedPair,
  QbPushedReceipt,
  QbPushedReconciliation,
  QbPushedStripe,
} from "~/lib/qb-pushed-reconciliation";
import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

function stripeHref(transactionId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/stripe/transactions/${transactionId}?${params}`;
}

function receiptHref(receipt: QbPushedReceipt, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  const base =
    receipt.kind === "refund"
      ? `/integrations/quickbooks/refund-receipts/${receipt.id}`
      : `/integrations/quickbooks/sales-receipts/${receipt.id}`;
  return `${base}?${params}`;
}

function receiptTotalMinor(receipt: QbPushedReceipt): number {
  const currency = (receipt.currencyCode ?? "gbp").toLowerCase();
  return parseWooCommerceMoneyMinor(receipt.totalAmt, currency) ?? 0;
}

function StripeSummary({
  stripe,
  returnTo,
}: {
  stripe: QbPushedStripe;
  returnTo: string;
}) {
  return (
    <Link to={stripeHref(stripe.id, returnTo)} className="text-teal hover:underline">
      <span className="font-mono text-[11px]">{stripe.stripeBalanceTransactionId}</span>
      <span className="ml-1.5 text-ink-muted">
        {formatCalendarDateShort(stripe.stripeDate)}
      </span>
      <span className="ml-1.5 font-sans text-xs text-dark">
        {formatMoneyMinor(stripe.amount, stripe.currency)}
      </span>
    </Link>
  );
}

function ReceiptSummary({
  receipt,
  returnTo,
}: {
  receipt: QbPushedReceipt;
  returnTo: string;
}) {
  const currency = (receipt.currencyCode ?? "gbp").toLowerCase();
  const label = receipt.kind === "refund" ? "Refund" : "Receipt";
  return (
    <Link to={receiptHref(receipt, returnTo)} className="text-teal hover:underline">
      <span className="font-medium text-dark">
        {receipt.docNumber ? `${label} ${receipt.docNumber}` : receipt.quickbooksId}
      </span>
      {receipt.txnDate && (
        <span className="ml-1.5 text-ink-muted">
          {formatCalendarDateShort(receipt.txnDate)}
        </span>
      )}
      <span className="ml-1.5 font-mono text-xs text-dark">
        {formatMoneyMinor(receiptTotalMinor(receipt), currency)}
      </span>
    </Link>
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
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
      <header className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-medium text-dark">
          {title}
          <span className="ml-2 font-normal text-ink-muted">({count})</span>
        </h2>
        <p className="mt-1 text-xs text-ink-muted">{description}</p>
      </header>
      <div className="px-4 py-3 sm:px-6">{children}</div>
    </section>
  );
}

function PairTable({
  pairs,
  returnTo,
  receiptHeading,
}: {
  pairs: QbPushedPair[];
  returnTo: string;
  receiptHeading: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-xs">
        <thead className="bg-surface-overlay text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Pushed Stripe charge</th>
            <th className="px-3 py-2 font-medium">{receiptHeading}</th>
            <th className="px-3 py-2 font-medium">Amounts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
          {pairs.map(({ stripe, receipt, amountMatches }) => (
            <tr key={`${stripe.id}-${receipt.id}`}>
              <td className="px-3 py-2">
                <StripeSummary stripe={stripe} returnTo={returnTo} />
                {stripe.productCode && (
                  <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                    {stripe.productCode}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <ReceiptSummary receipt={receipt} returnTo={returnTo} />
                {receipt.customerName && (
                  <span className="mt-0.5 block text-[10px] text-ink-muted">
                    {receipt.customerName}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-ink-muted">
                {amountMatches ? "Match" : "Differ"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({ data }: { data: QbPushedReconciliation }) {
  const rows = [
    ["Matched", data.counts.matched],
    ["Duplicates", data.counts.duplicates],
    ["Pushed, receipt in another period", data.counts.pushedReceiptOtherPeriod],
    ["Pushed, no QuickBooks receipt", data.counts.pushedMissing],
    ["Receipt in this period, push in another period", data.counts.receiptPushOtherPeriod],
    ["In QuickBooks, not pushed by Lotus", data.counts.qbNotPushed],
  ] as const;

  return (
    <section className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
      <header className="border-b border-sand-dark/40 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Summary</h2>
        <p className="mt-1 text-xs text-ink-muted">
          QuickBooks receipts synced into Lotus, compared with Stripe charges
          Lotus has marked as pushed.
        </p>
      </header>
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead className="bg-surface text-dark">
          <tr>
            <th className="px-3 py-2 font-medium">Section</th>
            <th className="px-3 py-2 text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-dark/30">
          {rows.map(([label, count]) => (
            <tr key={label} className="bg-surface-overlay">
              <td className="px-3 py-2 text-dark">{label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function QbPushedReconciliationPanels({
  data,
  returnTo,
}: {
  data: QbPushedReconciliation;
  returnTo: string;
}) {
  const notPushedByCustomer = new Map<string, QbPushedReceipt[]>();
  for (const receipt of data.qbNotPushed) {
    const key = receipt.customerName?.trim() || "Unknown customer";
    const list = notPushedByCustomer.get(key) ?? [];
    list.push(receipt);
    notPushedByCustomer.set(key, list);
  }
  const customerGroups = [...notPushedByCustomer.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div className="mt-6 space-y-6">
      <SummaryTable data={data} />

      {data.counts.amountMismatches > 0 && (
        <p className="text-sm text-amber-800">
          {data.counts.amountMismatches} matched pair
          {data.counts.amountMismatches === 1 ? "" : "s"} where the Stripe gross
          does not equal the QuickBooks receipt total.
        </p>
      )}

      <Panel
        title="Matched"
        count={data.counts.matched}
        description="One pushed Stripe charge and one QuickBooks receipt in this period."
      >
        {data.matched.length === 0 ? (
          <p className="text-sm text-ink-muted">No matched pairs in this period.</p>
        ) : (
          <ReconciliationDetailList>
            <ReconciliationDetailGroup summary={<GroupHeading label="All matched" count={data.matched.length} />}>
              <PairTable pairs={data.matched} returnTo={returnTo} receiptHeading="QuickBooks receipt" />
            </ReconciliationDetailGroup>
          </ReconciliationDetailList>
        )}
      </Panel>

      <Panel
        title="Duplicates"
        count={data.counts.duplicates}
        description="A pushed charge matches more than one QuickBooks receipt, including a second receipt outside this period. These are the copies to check."
      >
        {data.duplicates.length === 0 ? (
          <p className="text-sm text-ink-muted">No duplicate receipts in this period.</p>
        ) : (
          <ReconciliationDetailList>
            {data.duplicates.map((group) => (
              <DuplicateGroup key={group.stripe.id} group={group} returnTo={returnTo} />
            ))}
          </ReconciliationDetailList>
        )}
      </Panel>

      <Panel
        title="Pushed, receipt in another period"
        count={data.counts.pushedReceiptOtherPeriod}
        description="Lotus pushed the charge in this period. The QuickBooks receipt date falls outside it."
      >
        {data.pushedReceiptOtherPeriod.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ReconciliationDetailList>
            <ReconciliationDetailGroup
              summary={
                <GroupHeading
                  label="All"
                  count={data.pushedReceiptOtherPeriod.length}
                />
              }
            >
              <PairTable
                pairs={data.pushedReceiptOtherPeriod}
                returnTo={returnTo}
                receiptHeading="QuickBooks receipt"
              />
            </ReconciliationDetailGroup>
          </ReconciliationDetailList>
        )}
      </Panel>

      <Panel
        title="Pushed, no QuickBooks receipt"
        count={data.counts.pushedMissing}
        description="Marked pushed, but Lotus has no synced sales or refund receipt for that charge."
      >
        {data.pushedMissing.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ul className="divide-y divide-sand-dark/30 text-xs">
            {data.pushedMissing.map((stripe) => (
              <li key={stripe.id} className="py-2">
                <StripeSummary stripe={stripe} returnTo={returnTo} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Receipt in this period, push in another period"
        count={data.counts.receiptPushOtherPeriod}
        description="The QuickBooks receipt is in this period. The Stripe charge Lotus pushed is dated outside it."
      >
        {data.receiptPushOtherPeriod.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ReconciliationDetailList>
            <ReconciliationDetailGroup
              summary={
                <GroupHeading label="All" count={data.receiptPushOtherPeriod.length} />
              }
            >
              <PairTable
                pairs={data.receiptPushOtherPeriod}
                returnTo={returnTo}
                receiptHeading="QuickBooks receipt"
              />
            </ReconciliationDetailGroup>
          </ReconciliationDetailList>
        )}
      </Panel>

      <Panel
        title="In QuickBooks, not pushed by Lotus"
        count={data.counts.qbNotPushed}
        description="Synced QuickBooks receipts in this period that no Lotus push points at."
      >
        {data.qbNotPushed.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ReconciliationDetailList>
            {customerGroups.map(([customer, receipts]) => (
              <ReconciliationDetailGroup
                key={customer}
                summary={<GroupHeading label={customer} count={receipts.length} />}
              >
                <ul className="divide-y divide-sand-dark/30 px-3 text-xs">
                  {receipts.map((receipt) => (
                    <li key={receipt.id} className="py-2">
                      <ReceiptSummary receipt={receipt} returnTo={returnTo} />
                    </li>
                  ))}
                </ul>
              </ReconciliationDetailGroup>
            ))}
          </ReconciliationDetailList>
        )}
      </Panel>
    </div>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-surface px-3 py-2 sm:px-4">
      <h3 className="text-xs font-medium text-dark">
        {label}
        <span className="ml-1.5 font-normal text-ink-faint">({count})</span>
      </h3>
    </div>
  );
}

function DuplicateGroup({
  group,
  returnTo,
}: {
  group: QbPushedDuplicate;
  returnTo: string;
}) {
  return (
    <ReconciliationDetailGroup
      summary={
        <div className="bg-surface px-3 py-2 sm:px-4">
          <h3 className="text-xs font-medium text-dark">
            <StripeSummary stripe={group.stripe} returnTo={returnTo} />
            <span className="ml-1.5 font-normal text-ink-faint">
              ({group.receipts.length} receipts)
            </span>
          </h3>
        </div>
      }
    >
      <ul className="divide-y divide-sand-dark/30 px-3 text-xs">
        {group.receipts.map((receipt) => (
          <li key={receipt.id} className="py-2">
            <ReceiptSummary receipt={receipt} returnTo={returnTo} />
            {receipt.trackingNum && (
              <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                {receipt.trackingNum}
              </span>
            )}
          </li>
        ))}
      </ul>
    </ReconciliationDetailGroup>
  );
}
