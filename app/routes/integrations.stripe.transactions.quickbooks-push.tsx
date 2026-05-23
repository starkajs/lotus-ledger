import { Form, Link } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions.quickbooks-push";
import { AppPage } from "~/components/app-page";
import { QuickBooksSalesReceiptApiSignature } from "~/components/quickbooks-sales-receipt-api-signature";
import { SubmitButton } from "~/components/submit-button";
import {
  listQuickBooksAccounts,
  listQuickBooksClasses,
  listQuickBooksTaxCodes,
  syncQuickBooksTaxCodes,
} from "~/lib/quickbooks-master-data.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { planStripeQuickBooksPushForTransaction } from "~/lib/stripe-quickbooks-push-plan.server";
import {
  STRIPE_QB_AMOUNT_SOURCES,
  STRIPE_QB_CUSTOMER_MODES,
  STRIPE_QB_PUSH_MATCH_TYPES,
  STRIPE_QB_PUSH_RULE_FIELDS,
  STRIPE_QB_PUSH_RULE_FIELD_LABELS,
} from "~/lib/stripe-quickbooks-push.constants";
import {
  createStripeQuickBooksPushRule,
  deleteStripeQuickBooksPushRule,
  listActiveStripeQuickBooksPushRules,
  listStripeQuickBooksPushRules,
  updateStripeQuickBooksPushRule,
} from "~/lib/stripe-quickbooks-push-rules.server";
import { getStripeBalanceTransactionByPreviewRef } from "~/lib/stripe-balance-transactions.server";
import { requireUser } from "~/lib/session.server";

const TRANSACTIONS_PATH = "/integrations/stripe/transactions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks push rules — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const previewId = url.searchParams.get("preview")?.trim() ?? "";

  const [rules, qbAccounts, qbClasses, qbTaxCodes, qbConnected] = await Promise.all([
    listStripeQuickBooksPushRules(),
    listQuickBooksAccounts(),
    listQuickBooksClasses(),
    listQuickBooksTaxCodes(),
    getQuickBooksTokens(),
  ]);

  let previewPlan: Awaited<
    ReturnType<typeof planStripeQuickBooksPushForTransaction>
  > | null = null;
  let previewTxnId: string | null = null;
  if (previewId) {
    const tx = await getStripeBalanceTransactionByPreviewRef(previewId);
    if (tx) {
      previewTxnId = tx.id;
      previewPlan = await planStripeQuickBooksPushForTransaction({
        transaction: tx,
        pushRules: await listActiveStripeQuickBooksPushRules(),
      });
    }
  }

  const taxCodeLabelById = new Map(
    qbTaxCodes.taxCodes.map((t) => [t.quickbooksId, t.name]),
  );

  return {
    rules,
    qbAccounts,
    qbClasses,
    qbTaxCodes,
    taxCodeLabelById: Object.fromEntries(taxCodeLabelById),
    qbConnected: Boolean(qbConnected),
    previewId,
    previewTxnId,
    previewPlan,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const pattern = String(form.get("pattern") ?? "").trim();
    const depositToAccountId = String(form.get("depositToAccountId") ?? "").trim();
    if (!pattern) {
      return {
        scope: "create" as const,
        error: "Pattern is required",
      };
    }
    await createStripeQuickBooksPushRule({
      priority: Number(form.get("priority") ?? "100") || 100,
      field: String(form.get("field") ?? "any"),
      matchType: String(form.get("matchType") ?? "contains"),
      pattern,
      depositToAccountId,
      quickbooksClassId: String(form.get("quickbooksClassId") ?? "") || null,
      paymentMethodId: String(form.get("paymentMethodId") ?? "") || null,
      amountSource: String(form.get("amountSource") ?? "net") as "net" | "gross",
      customerMode: String(form.get("customerMode") ?? "omit") as
        | "omit"
        | "bill_email"
        | "fixed",
      customerQuickbooksId:
        String(form.get("customerQuickbooksId") ?? "").trim() || null,
      lineDescription: String(form.get("lineDescription") ?? "").trim() || null,
      privateNoteTemplate:
        String(form.get("privateNoteTemplate") ?? "").trim() || null,
      taxCodeId: String(form.get("taxCodeId") ?? "").trim() || null,
    });
    return { scope: "create" as const, success: true as const };
  }

  if (intent === "sync-tax-codes") {
    const user = await requireUser(request);
    try {
      const result = await syncQuickBooksTaxCodes({
        triggeredBy: "app",
        userId: user.id,
      });
      return { scope: "sync-tax-codes" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "sync-tax-codes" as const,
        error: err instanceof Error ? err.message : "Sync failed",
      };
    }
  }

  if (intent === "toggle") {
    const id = String(form.get("id") ?? "");
    const isActive = form.get("isActive") === "true";
    if (!id) return { scope: "toggle" as const, error: "Rule id required" };
    await updateStripeQuickBooksPushRule(id, { isActive: !isActive });
    return { scope: "toggle" as const, success: true as const };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    if (!id) return { scope: "delete" as const, error: "Rule id required" };
    await deleteStripeQuickBooksPushRule(id);
    return { scope: "delete" as const, success: true as const };
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function StripeQuickBooksPushRulesPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    rules,
    qbAccounts,
    qbClasses,
    qbTaxCodes,
    taxCodeLabelById,
    qbConnected,
    previewId,
    previewTxnId,
    previewPlan,
  } = loaderData;

  const depositAccounts = qbAccounts.accounts.filter((a) => a.active);
  const activeTaxCodes = qbTaxCodes.taxCodes.filter((t) => t.active);

  return (
    <AppPage
      title="QuickBooks push rules"
      description="Map Stripe balance transactions to QuickBooks Sales Receipt fields. Product → QB Item still comes from product match rules."
      maxWidth="full"
      actions={
        <Link
          to={TRANSACTIONS_PATH}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Stripe transactions
        </Link>
      }
    >
      <QuickBooksSalesReceiptApiSignature
        footer={
          <>
            Per Stripe account: customer, deposit to, payment method, reference
            no, message. Per product: QB item and VAT %. Line amount from Stripe
            gross (net ex-VAT when VAT applies). Income account, class, tax from
            synced QB item. Push not enabled yet — use preview below.
          </>
        }
      />

      {!qbConnected && (
        <p className="mt-4 text-sm text-maroon">
          Connect QuickBooks first to load deposit accounts and classes.{" "}
          <Link to="/integrations/quickbooks" className="text-teal underline">
            QuickBooks settings
          </Link>
        </p>
      )}

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <h2 className="text-sm font-medium text-dark">Preview push plan</h2>
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
              {previewPlan.pushRuleId && (
                <span className="text-ink-muted">
                  {" "}
                  · rule {previewPlan.pushRuleId.slice(0, 8)}…
                </span>
              )}
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
              <pre className="overflow-x-auto rounded-jamyang border border-sand-dark/40 bg-surface p-3 text-[11px] font-mono text-dark">
                {JSON.stringify(previewPlan.salesReceipt, null, 2)}
              </pre>
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

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-dark">Add push rule</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Lower priority runs first. Rules mainly control which transactions
              match; optional deposit fallback and note templates.
            </p>
          </div>
          {qbConnected && (
            <Form method="post">
              <input type="hidden" name="intent" value="sync-tax-codes" />
              <SubmitButton
                intent="sync-tax-codes"
                variant="pill"
                loadingLabel="Syncing…"
              >
                Sync VAT codes
              </SubmitButton>
            </Form>
          )}
        </div>
        {actionData?.scope === "sync-tax-codes" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        {actionData?.scope === "sync-tax-codes" &&
          actionData.success &&
          actionData.result && (
            <p className="mt-2 text-sm text-jade">
              VAT codes synced ({actionData.result.total} in QuickBooks,{" "}
              {actionData.result.created} new, {actionData.result.updated}{" "}
              updated).
            </p>
          )}
        {qbConnected && activeTaxCodes.length === 0 && (
          <p className="mt-2 text-sm text-maroon">
            No VAT codes in Lotus Ledger yet. Sync from QuickBooks or refresh{" "}
            <Link
              to="/integrations/quickbooks/items"
              className="text-teal underline"
            >
              Products &amp; services
            </Link>{" "}
            (items sync also imports tax codes).
          </p>
        )}
        <Form method="post" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="intent" value="create" />
          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
            <span className="text-ink-muted">Pattern</span>
            <input
              name="pattern"
              required
              placeholder="charge"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Priority</span>
            <input
              name="priority"
              type="number"
              defaultValue={100}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Field</span>
            <select
              name="field"
              defaultValue="stripe_type"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {STRIPE_QB_PUSH_RULE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {STRIPE_QB_PUSH_RULE_FIELD_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Match</span>
            <select
              name="matchType"
              defaultValue="contains"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {STRIPE_QB_PUSH_MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
            <span className="text-ink-muted">
              Deposit account (fallback — prefer Stripe account mapping)
            </span>
            <select
              name="depositToAccountId"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">None — use Stripe account</option>
              {depositAccounts.map((a) => (
                <option key={a.quickbooksId} value={a.quickbooksId}>
                  {a.fullyQualifiedName ?? a.name} ({a.quickbooksId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
            <span className="text-ink-muted">VAT / tax code (optional)</span>
            <select
              name="taxCodeId"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Use QuickBooks item default</option>
              {activeTaxCodes.map((t) => (
                <option key={t.quickbooksId} value={t.quickbooksId}>
                  {t.name} ({t.quickbooksId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Amount on receipt</span>
            <select
              name="amountSource"
              defaultValue="net"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {STRIPE_QB_AMOUNT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">QB class (optional)</span>
            <select
              name="quickbooksClassId"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">None</option>
              {qbClasses.classes
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.quickbooksId} value={c.quickbooksId}>
                    {c.fullyQualifiedName ?? c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Customer</span>
            <select
              name="customerMode"
              defaultValue="omit"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {STRIPE_QB_CUSTOMER_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Fixed QB customer id</span>
            <input
              name="customerQuickbooksId"
              placeholder="When customer = fixed"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
            <span className="text-ink-muted">Line description (optional)</span>
            <input
              name="lineDescription"
              placeholder="{{product_code}} — Stripe"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
            <span className="text-ink-muted">Private note template</span>
            <input
              name="privateNoteTemplate"
              placeholder="LL {{stripe_balance_transaction_id}}"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono text-[11px]"
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton intent="create-rule" variant="pill" loadingLabel="Adding…">
              Add rule
            </SubmitButton>
          </div>
        </Form>
        {actionData?.scope === "create" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
      </section>

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay overflow-hidden">
        <h2 className="border-b border-sand-dark/40 px-4 py-3 text-sm font-medium text-dark sm:px-6">
          Rules ({rules.length})
        </h2>
        {rules.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted sm:px-6">
            No push rules yet. Add a catch-all rule on{" "}
            <code className="font-mono">stripe_type</code> /{" "}
            <code className="font-mono">charge</code> to start.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Pri</th>
                  <th className="px-3 py-2 font-medium">Match</th>
                  <th className="px-3 py-2 font-medium">Deposit account</th>
                  <th className="px-3 py-2 font-medium">VAT code</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/30">
                {rules.map((rule) => (
                  <tr key={rule.id} className="bg-surface-overlay">
                    <td className="px-3 py-2 font-mono">{rule.priority}</td>
                    <td className="px-3 py-2">
                      <span className="text-ink-faint">{rule.field}</span>{" "}
                      <span className="font-mono text-dark">{rule.matchType}</span>{" "}
                      <span className="text-dark">{rule.pattern}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {rule.depositToAccountId}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {rule.taxCodeId ? (
                        <span title={rule.taxCodeId}>
                          {taxCodeLabelById[rule.taxCodeId] ?? rule.taxCodeId}
                        </span>
                      ) : (
                        <span className="text-ink-faint">item default</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{rule.amountSource}</td>
                    <td className="px-3 py-2">
                      {rule.isActive ? (
                        <span className="text-jade">yes</span>
                      ) : (
                        <span className="text-ink-faint">no</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <Form method="post" className="inline">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={rule.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(rule.isActive)}
                        />
                        <button
                          type="submit"
                          className="text-teal hover:underline"
                        >
                          {rule.isActive ? "Disable" : "Enable"}
                        </button>
                      </Form>
                      <Form method="post" className="inline">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={rule.id} />
                        <button
                          type="submit"
                          className="text-maroon hover:underline"
                        >
                          Delete
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppPage>
  );
}
