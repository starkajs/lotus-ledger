import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions.quickbooks-push";
import { AppPage } from "~/components/app-page";
import { QuickBooksSalesReceiptApiSignature } from "~/components/quickbooks-sales-receipt-api-signature";
import { SubmitButton } from "~/components/submit-button";
import { listQuickBooksTaxCodes } from "~/lib/quickbooks-master-data.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import {
  clearStripeTransactionQuickBooksPush,
  pushStripeBalanceTransactionToQuickBooks,
} from "~/lib/stripe-quickbooks-push-execute.server";
import {
  planStripeQuickBooksPushForTransaction,
  type StripeQuickBooksPushPlan,
} from "~/lib/stripe-quickbooks-push-plan.server";
import { getStripeBalanceTransactionByPreviewRef } from "~/lib/stripe-balance-transactions.server";
import { requireUser } from "~/lib/session.server";

const TRANSACTIONS_PATH = "/integrations/stripe/transactions";
const PUSH_PATH = "/integrations/stripe/transactions/quickbooks-push";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks push — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const previewId = url.searchParams.get("preview")?.trim() ?? "";

  const [qbTaxCodes, qbConnected] = await Promise.all([
    listQuickBooksTaxCodes(),
    getQuickBooksTokens(),
  ]);

  let previewPlan: StripeQuickBooksPushPlan | null = null;
  let previewTxnId: string | null = null;
  let previewPushed = false;
  let previewQuickbooksSalesReceiptId: string | null = null;
  if (previewId) {
    const tx = await getStripeBalanceTransactionByPreviewRef(previewId);
    if (tx) {
      previewTxnId = tx.id;
      previewPushed =
        tx.pushedToQuickbooks === true || Boolean(tx.quickbooksSalesReceiptId);
      previewQuickbooksSalesReceiptId = tx.quickbooksSalesReceiptId;
      previewPlan = await planStripeQuickBooksPushForTransaction({
        transaction: tx,
      });
    }
  }

  const taxCodeLabelById = Object.fromEntries(
    qbTaxCodes.taxCodes.map((t) => [t.quickbooksId, t.name]),
  );

  return {
    taxCodeLabelById,
    qbConnected: Boolean(qbConnected),
    previewId,
    previewTxnId,
    previewPlan,
    previewPushed,
    previewQuickbooksSalesReceiptId,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "push") {
    const transactionId = String(form.get("transactionId") ?? "").trim();
    const preview = String(form.get("preview") ?? "").trim();
    if (!transactionId) {
      return { scope: "push" as const, error: "Transaction id required" };
    }
    try {
      const result = await pushStripeBalanceTransactionToQuickBooks(
        transactionId,
      );
      return {
        scope: "push" as const,
        preview,
        transactionId,
        plan: result.plan,
        api: result.api,
        salesReceiptId: result.salesReceiptId,
        lotusSalesReceiptId: result.lotusSalesReceiptId,
      };
    } catch (err) {
      return {
        scope: "push" as const,
        preview,
        transactionId,
        error: err instanceof Error ? err.message : "Push failed",
      };
    }
  }

  if (intent === "clear-qb-push") {
    const transactionId = String(form.get("transactionId") ?? "").trim();
    const preview = String(form.get("preview") ?? "").trim();
    if (!transactionId) {
      return { scope: "clear-qb-push" as const, error: "Transaction id required" };
    }
    const result = await clearStripeTransactionQuickBooksPush(transactionId);
    if (!result.ok) {
      return {
        scope: "clear-qb-push" as const,
        preview,
        transactionId,
        error: result.reason,
      };
    }
    const qs = preview ? `?preview=${encodeURIComponent(preview)}` : "";
    return redirect(`${PUSH_PATH}${qs}`);
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function StripeQuickBooksPushPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    taxCodeLabelById,
    qbConnected,
    previewId,
    previewTxnId,
    previewPlan,
    previewPushed,
    previewQuickbooksSalesReceiptId,
  } = loaderData;

  return (
    <AppPage
      title="QuickBooks push"
      description="Preview and test pushing Stripe transactions to QuickBooks Sales Receipts using Stripe account mapping and Lotus product details."
      maxWidth="full"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/integrations/quickbooks/tax-codes"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            VAT codes
          </Link>
          <Link
            to={TRANSACTIONS_PATH}
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Stripe transactions
          </Link>
        </div>
      }
    >
      {!qbConnected && (
        <p className="mt-4 text-sm text-maroon">
          Connect QuickBooks first.{" "}
          <Link to="/integrations/quickbooks" className="text-teal underline">
            QuickBooks settings
          </Link>
        </p>
      )}

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <h2 className="text-sm font-medium text-dark">
          Preview &amp; test push
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          Requires a classified transaction (Lotus product with QB item and QB VAT
          code on /products), and Stripe account QuickBooks mapping on Integrations
          → Stripe.
        </p>
        <Form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs flex-1 min-w-[16rem]">
            <span className="text-ink-muted">Transaction ref</span>
            <input
              name="preview"
              defaultValue={previewId}
              placeholder="Lotus UUID, txn_…, or pi_…"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <button
            type="submit"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Preview
          </button>
        </Form>
        {previewId && !previewPlan && (
          <p className="mt-2 text-sm text-maroon">
            Transaction not found. Use the Lotus id from the transaction detail URL
            (UUID), or the Stripe balance id <code className="font-mono">txn_…</code>{" "}
            / payment intent <code className="font-mono">pi_…</code>.
          </p>
        )}
        {previewPlan && previewTxnId && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">
              <span
                className={
                  previewPlan.ready
                    ? "font-medium text-jade"
                    : "font-medium text-maroon"
                }
              >
                {previewPlan.ready ? "Ready to push" : "Not ready"}
              </span>
              <span className="text-ink-muted">
                {" "}
                · Stripe account + product mapping
              </span>
              {previewPlan.vatRatePercent > 0 && (
                <span className="text-ink-muted">
                  {" "}
                  · VAT {previewPlan.vatRatePercent}%
                </span>
              )}
              {previewPlan.grossAmountMajor != null &&
                previewPlan.lineAmountMajor != null && (
                  <span className="text-ink-muted">
                    {" "}
                    · gross {previewPlan.grossAmountMajor}{" "}
                    {previewPlan.currency?.toUpperCase()} → line{" "}
                    {previewPlan.lineAmountMajor}
                  </span>
                )}
              {previewPlan.taxCodeId && (
                <span className="text-ink-muted">
                  {" "}
                  · tax{" "}
                  {taxCodeLabelById[previewPlan.taxCodeId] ??
                    previewPlan.taxCodeId}
                  {previewPlan.taxCodeSource
                    ? ` (${previewPlan.taxCodeSource})`
                    : ""}
                </span>
              )}
            </p>
            {previewPlan.issues.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-maroon space-y-1">
                {previewPlan.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {previewPlan.salesReceipt && (
              <>
                <h3 className="text-xs font-medium text-ink-muted">
                  Request body (POST salesreceipt)
                </h3>
                <pre className="overflow-x-auto rounded-jamyang border border-sand-dark/40 bg-surface p-3 text-[11px] font-mono text-dark">
                  {JSON.stringify(previewPlan.salesReceipt, null, 2)}
                </pre>
              </>
            )}
            {previewPushed && previewQuickbooksSalesReceiptId && (
              <p className="text-sm text-amber-800">
                Already pushed (QB receipt{" "}
                <span className="font-mono text-xs">
                  {previewQuickbooksSalesReceiptId}
                </span>
                ). Clear the flag to push again.
              </p>
            )}
            {previewTxnId && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {previewPushed ? (
                  <Form method="post">
                    <input
                      type="hidden"
                      name="transactionId"
                      value={previewTxnId}
                    />
                    <input type="hidden" name="preview" value={previewId} />
                    <SubmitButton
                      intent="clear-qb-push"
                      variant="pill"
                      loadingLabel="Clearing…"
                    >
                      Clear pushed flag
                    </SubmitButton>
                  </Form>
                ) : (
                  qbConnected && (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="transactionId"
                        value={previewTxnId}
                      />
                      <input type="hidden" name="preview" value={previewId} />
                      <SubmitButton
                        intent="push"
                        variant="primary"
                        className="!px-5 !py-2"
                        loadingLabel="Pushing to QuickBooks…"
                        disabled={!previewPlan.ready}
                      >
                        Push to QuickBooks
                      </SubmitButton>
                    </Form>
                  )
                )}
                {!previewPushed && !previewPlan.ready && (
                  <p className="text-xs text-ink-muted">
                    Fix the issues above before pushing.
                  </p>
                )}
              </div>
            )}
            {!qbConnected && previewPlan.salesReceipt && (
              <p className="text-sm text-maroon">
                Connect QuickBooks to push this receipt.
              </p>
            )}
            {actionData?.scope === "clear-qb-push" &&
              actionData.transactionId === previewTxnId &&
              actionData.error && (
                <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
              )}
            {actionData?.scope === "push" &&
              actionData.transactionId === previewTxnId && (
                <div className="mt-4 space-y-2 rounded-jamyang border border-sand-dark/40 bg-surface p-3">
                  <h3 className="text-xs font-medium text-dark">
                    QuickBooks API response
                  </h3>
                  {actionData.error && (
                    <p className="text-sm text-maroon">{actionData.error}</p>
                  )}
                  {actionData.api && (
                    <>
                      <p
                        className={
                          actionData.api.ok
                            ? "text-sm font-medium text-jade"
                            : "text-sm font-medium text-maroon"
                        }
                      >
                        {actionData.api.ok ? (
                          <>
                            Created Sales Receipt{" "}
                            {actionData.salesReceiptId ??
                              actionData.api.salesReceipt.Id}
                            {actionData.lotusSalesReceiptId ? (
                              <>
                                {" "}
                                ·{" "}
                                <Link
                                  to={`/integrations/quickbooks/sales-receipts/${actionData.lotusSalesReceiptId}`}
                                  className="text-teal underline"
                                >
                                  View in Lotus
                                </Link>
                              </>
                            ) : null}
                          </>
                        ) : (
                          actionData.api.message
                        )}
                      </p>
                      <pre className="overflow-x-auto text-[11px] font-mono text-dark">
                        {JSON.stringify(actionData.api.raw, null, 2)}
                      </pre>
                    </>
                  )}
                  {!actionData.api && actionData.plan && !actionData.error && (
                    <p className="text-sm text-maroon">
                      Push did not run — plan not ready.
                    </p>
                  )}
                </div>
              )}
            <Link
              to={`/integrations/stripe/transactions/${previewTxnId}`}
              className="text-xs text-teal hover:underline"
            >
              Open transaction
            </Link>
          </div>
        )}
      </section>

      <div className="mt-6">
        <QuickBooksSalesReceiptApiSignature
          footer={
          <>
            Per Stripe account: customer, deposit to, payment method, reference
            no, message. Per Lotus product: QB item, VAT %, and QB VAT code (
            <Link to="/integrations/quickbooks/tax-codes" className="text-teal underline">
              sync VAT codes
            </Link>
            ). Line amount from Stripe gross (net ex-VAT when VAT applies). Income
            account and class from synced QB item.
          </>
        }
        />
      </div>
    </AppPage>
  );
}
