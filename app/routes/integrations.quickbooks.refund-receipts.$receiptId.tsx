import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.refund-receipts.$receiptId";
import { AppPage } from "~/components/app-page";
import {
  formatQuickBooksDate,
  formatQuickBooksDateTime,
  formatQuickBooksMoney,
} from "~/lib/quickbooks-format";
import { resolveQuickBooksSalesReceiptLines } from "~/lib/quickbooks-sales-receipt-parse";
import { getQuickBooksRefundReceiptById } from "~/lib/quickbooks-refund-receipts.server";
import { requireUser } from "~/lib/session.server";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-sand-dark/30 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="text-sm text-dark break-all">{children}</dd>
    </div>
  );
}

function MultilineText({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words text-dark">{value}</span>
  );
}

export function meta({ data }: Route.MetaArgs) {
  const label =
    data?.receipt.docNumber ?? data?.receipt.quickbooksId ?? "Refund receipt";
  return [
    { title: `${label} — Lotus Ledger` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const receipt = await getQuickBooksRefundReceiptById(params.receiptId);
  if (!receipt) {
    throw new Response("Refund receipt not found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("returnTo") ?? "/integrations/quickbooks/refund-receipts";

  const lines = resolveQuickBooksSalesReceiptLines({
    lineItems: receipt.lineItems,
    quickbooksRaw: receipt.quickbooksRaw,
  });

  return { receipt, lines, returnTo };
}

export default function QuickBooksRefundReceiptDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { receipt, lines, returnTo } = loaderData;

  return (
    <AppPage
      title="Refund receipt"
      description={
        receipt.docNumber
          ? `Doc ${receipt.docNumber}`
          : receipt.quickbooksId
      }
      actions={
        <Link
          to={returnTo}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Back to list
        </Link>
      }
    >
      {receipt.qbStatus === "deleted_in_qb" && (
        <div
          role="alert"
          className="mb-4 rounded-jamyang-lg border border-maroon/30 bg-maroon/5 px-4 py-3 text-sm text-maroon"
        >
          <p className="font-medium">Removed in QuickBooks</p>
          <p className="mt-1 text-ink-muted text-dark">
            This refund receipt no longer exists in QuickBooks (within the last
            30-day sync window).
            {receipt.deletedInQbAt && (
              <>
                {" "}
                Detected {formatQuickBooksDateTime(receipt.deletedInQbAt)}.
              </>
            )}
          </p>
        </div>
      )}

      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Summary</h2>
        <dl className="mt-3">
          <DetailRow label="Customer">
            {receipt.customerName ?? "—"}
            {receipt.customerQuickbooksId && (
              <span className="mt-1 block font-mono text-xs text-ink-faint">
                {receipt.customerQuickbooksId}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Date">{formatQuickBooksDate(receipt.txnDate)}</DetailRow>
          <DetailRow label="Tracking #">
            {receipt.trackingNum ? (
              <span className="font-mono text-xs">{receipt.trackingNum}</span>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </DetailRow>
          <DetailRow label="Currency">
            {receipt.currencyCode || receipt.currencyName ? (
              <span>
                {receipt.currencyCode?.toUpperCase() ?? "—"}
                {receipt.currencyName ? ` (${receipt.currencyName})` : ""}
              </span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Total">
            <span className="font-mono">
              {formatQuickBooksMoney(receipt.totalAmt, receipt.currencyCode)}
            </span>
          </DetailRow>
          <DetailRow label="Tax">
            {receipt.totalTax
              ? formatQuickBooksMoney(receipt.totalTax, receipt.currencyCode)
              : "—"}
          </DetailRow>
          <DetailRow label="Payment method">
            {receipt.paymentMethod ?? "—"}
          </DetailRow>
          <DetailRow label="Deposit to">{receipt.depositToAccountRef ?? "—"}</DetailRow>
          <DetailRow label="Class">{receipt.classRefName ?? "—"}</DetailRow>
          <DetailRow label="Department">{receipt.departmentRefName ?? "—"}</DetailRow>
        </dl>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
          <h2 className="text-sm font-medium text-dark">Line items</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {receipt.lineCount ?? lines.length} line
            {(receipt.lineCount ?? lines.length) === 1 ? "" : "s"} from synced
            QuickBooks data.
          </p>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/40">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Item (ItemRef)</th>
                  <th className="px-3 py-2 font-medium">Account (ItemAccountRef)</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Unit</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
                {lines.map((line) => (
                  <tr key={line.lineNumber}>
                    <td className="px-3 py-2 text-ink-muted">{line.lineNumber}</td>
                    <td className="px-3 py-2">
                      <span className="text-dark">{line.itemRefName ?? "—"}</span>
                      {line.itemRefId && (
                        <span className="block font-mono text-[10px] text-ink-faint">
                          {line.itemRefId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-dark">{line.itemAccountRefName ?? "—"}</span>
                      {line.itemAccountRefId && (
                        <span className="block font-mono text-[10px] text-ink-faint">
                          {line.itemAccountRefId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {line.description ?? line.detailType ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{line.qty ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {line.unitPrice ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-dark">
                      {line.amount ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">All fields</h2>
        <dl className="mt-3">
          <DetailRow label="QuickBooks ID">
            <span className="font-mono text-xs">{receipt.quickbooksId}</span>
          </DetailRow>
          <DetailRow label="Doc number">{receipt.docNumber ?? "—"}</DetailRow>
          <DetailRow label="Customer memo">
            <MultilineText value={receipt.customerMemo} />
          </DetailRow>
          <DetailRow label="Private note">
            <MultilineText value={receipt.privateNote} />
          </DetailRow>
          <DetailRow label="Bill email">{receipt.billEmail ?? "—"}</DetailRow>
          <DetailRow label="Ship to">
            <MultilineText value={receipt.shipAddrSummary} />
          </DetailRow>
          <DetailRow label="Sync token">{receipt.syncToken ?? "—"}</DetailRow>
          <DetailRow label="Created (QuickBooks)">
            {formatQuickBooksDateTime(receipt.qbCreatedAt)}
          </DetailRow>
          <DetailRow label="Updated (QuickBooks)">
            {formatQuickBooksDateTime(receipt.qbUpdatedAt)}
          </DetailRow>
          <DetailRow label="Synced to Lotus">
            {formatQuickBooksDateTime(receipt.syncedAt)}
          </DetailRow>
          <DetailRow label="QuickBooks status">
            {receipt.qbStatus === "deleted_in_qb" ? (
              <span className="text-maroon font-medium">Removed in QuickBooks</span>
            ) : (
              <span className="text-jade">Active in QuickBooks</span>
            )}
          </DetailRow>
          <DetailRow label="Internal ID">
            <span className="font-mono text-xs">{receipt.id}</span>
          </DetailRow>
        </dl>
      </div>

      {receipt.quickbooksRaw && (
        <details className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark sm:px-6">
            Raw QuickBooks API response
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-sand-dark/40 px-4 py-3 text-xs text-ink-muted sm:px-6">
            {JSON.stringify(receipt.quickbooksRaw, null, 2)}
          </pre>
        </details>
      )}
    </AppPage>
  );
}
