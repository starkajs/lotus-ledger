import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.sales-receipts";
import { QuickBooksMasterDataPage } from "~/components/quickbooks-master-data-page";
import {
  formatQuickBooksDate,
  formatQuickBooksMoney,
} from "~/lib/quickbooks-format";
import {
  listQuickBooksSalesReceipts,
  parseQbSalesReceiptPresenceFilter,
  syncQuickBooksSalesReceipts,
  type QbSalesReceiptPresenceFilter,
  type QuickBooksSalesReceiptRecord,
} from "~/lib/quickbooks-sales-receipts.server";
import { requireUser } from "~/lib/session.server";

function receiptDetailHref(receiptId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/quickbooks/sales-receipts/${receiptId}?${params}`;
}

function listHref(options: {
  page?: number;
  presence?: QbSalesReceiptPresenceFilter;
}) {
  const params = new URLSearchParams();
  if (options.presence && options.presence !== "active") {
    params.set("presence", options.presence);
  }
  if (options.page && options.page > 1) {
    params.set("page", String(options.page));
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function QbStatusBadge({ receipt }: { receipt: QuickBooksSalesReceiptRecord }) {
  if (receipt.qbStatus === "deleted_in_qb") {
    return (
      <span className="inline-flex rounded bg-maroon/10 px-1.5 py-0.5 text-[10px] font-medium text-maroon">
        Removed in QB
      </span>
    );
  }
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks sales receipts — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const presence = parseQbSalesReceiptPresenceFilter(
    url.searchParams.get("presence"),
  );
  return listQuickBooksSalesReceipts({ page, presence });
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh") {
    return { scope: "refresh" as const, error: "Unknown action" };
  }
  try {
    const result = await syncQuickBooksSalesReceipts();
    return { scope: "refresh" as const, success: true as const, result };
  } catch (err) {
    return {
      scope: "refresh" as const,
      error: err instanceof Error ? err.message : "Refresh failed",
    };
  }
}

function ReceiptHints({ receipt }: { receipt: QuickBooksSalesReceiptRecord }) {
  if (!receipt.lineSummary) return null;
  return (
    <p className="text-[10px] leading-snug text-ink-muted">
      <span className="text-ink-faint">Lines: </span>
      {receipt.lineSummary}
    </p>
  );
}

export default function QuickBooksSalesReceiptsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const returnTo = location.pathname + location.search;
  const syncResult =
    actionData?.scope === "refresh" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "refresh" && actionData.error ? actionData.error : null;

  const { receipts, total, page, pageSize, totalPages, presence } = loaderData;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <QuickBooksMasterDataPage
      title="Sales receipts"
      description="Last 30 days from QuickBooks. Refresh upserts by ID; receipts deleted in QuickBooks are marked removed (not deleted from Lotus Ledger)."
      connected={loaderData.connected}
      companyName={loaderData.companyName}
      lastSyncedAt={loaderData.lastSyncedAt}
      postAction={postAction}
      syncResult={syncResult}
      syncError={syncError}
      count={total}
      countLabel="sales receipts"
    >
      {loaderData.connected && (
        <>
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">QuickBooks status</span>
              <select
                name="presence"
                defaultValue={presence}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[14rem]"
              >
                <option value="active">Active in QuickBooks only</option>
                <option value="deleted_in_qb">Removed in QuickBooks only</option>
                <option value="all">All (including removed)</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
            >
              Apply
            </button>
            {presence !== "active" && (
              <Link
                to={listHref({ presence: "active" })}
                className="rounded-jamyang-pill border border-teal/40 bg-teal/5 px-3 py-1.5 text-sm text-teal hover:bg-teal/10"
              >
                Active only
              </Link>
            )}
          </form>

          <p className="mb-3 text-xs text-ink-muted">
            {total === 0
              ? "No sales receipts for this filter."
              : `${total} receipt${total === 1 ? "" : "s"}`}
            {presence === "active" && total > 0 && (
              <span className="text-ink-faint"> · safe for Stripe reconciliation</span>
            )}
            {total > 0 && (
              <span className="text-ink-faint">
                {" "}
                · {rangeStart}–{rangeEnd}
              </span>
            )}
          </p>
        </>
      )}

      {receipts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {presence === "active"
            ? "No active sales receipts. Refresh from QuickBooks, or check Removed in QuickBooks."
            : "No receipts match this filter."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-jamyang border border-sand-dark/50">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Number</th>
                  <th className="px-2 py-1.5 font-medium">Tracking #</th>
                  <th className="px-2 py-1.5 font-medium">Customer</th>
                  <th className="px-2 py-1.5 font-medium text-right">Total</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface-overlay">
                {receipts.map((row) => {
                  const hasHints = Boolean(row.lineSummary);
                  const isDeleted = row.qbStatus === "deleted_in_qb";
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`group align-top hover:bg-sand/20 ${isDeleted ? "opacity-75" : ""} ${hasHints ? "" : "border-b border-sand-dark/30"}`}
                      >
                        <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                          {formatQuickBooksDate(row.txnDate)}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-dark">
                          {row.docNumber ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-ink-muted max-w-[8rem] truncate">
                          {row.trackingNum ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="block truncate max-w-[12rem] text-dark">
                            {row.customerName ?? "—"}
                          </span>
                          {row.classRefName && (
                            <span className="text-[10px] text-ink-faint">
                              {row.classRefName}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-dark whitespace-nowrap">
                          {formatQuickBooksMoney(row.totalAmt, row.currencyCode)}
                        </td>
                        <td className="px-2 py-1.5">
                          <QbStatusBadge receipt={row} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Link
                            to={receiptDetailHref(row.id, returnTo)}
                            className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                      {hasHints && (
                        <tr
                          className={`group border-b border-sand-dark/30 hover:bg-sand/20 ${isDeleted ? "opacity-75" : ""}`}
                        >
                          <td className="px-2 pb-1.5 pt-0" />
                          <td colSpan={5} className="px-2 pb-2 pt-0 align-top">
                            <ReceiptHints receipt={row} />
                          </td>
                          <td className="px-2 pb-1.5 pt-0" />
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
              className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm"
              aria-label="Pagination"
            >
              {page > 1 ? (
                <Link
                  to={listHref({ page: page - 1, presence })}
                  className="rounded-jamyang border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                >
                  Previous
                </Link>
              ) : null}
              <span className="text-ink-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  to={listHref({ page: page + 1, presence })}
                  className="rounded-jamyang border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          )}
        </>
      )}
    </QuickBooksMasterDataPage>
  );
}
