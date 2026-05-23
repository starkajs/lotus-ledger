import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/integrations.stripe";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import {
  listQuickBooksAccounts,
  listQuickBooksPaymentMethods,
  syncQuickBooksPaymentMethods,
} from "~/lib/quickbooks-master-data.server";
import { DEFAULT_STRIPE_QB_PAYMENT_REF_TEMPLATE } from "~/lib/stripe-connections-quickbooks.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import {
  createStripeConnection,
  deleteStripeConnection,
  listStripeConnections,
  verifyStoredStripeConnection,
  type StripeConnectionPublic,
} from "~/lib/stripe-connections.server";
import { updateStripeConnectionQuickBooksMapping } from "~/lib/stripe-connections-quickbooks.server";
import {
  fetchStripeTransactions,
  type StripeTransactionSummary,
} from "~/lib/stripe-transactions.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stripe — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const [connections, qbAccounts, qbPaymentMethods, qbTokens] = await Promise.all([
    listStripeConnections(),
    listQuickBooksAccounts(),
    listQuickBooksPaymentMethods(),
    getQuickBooksTokens(),
  ]);

  const url = new URL(request.url);
  const selectedId =
    url.searchParams.get("account") ?? connections[0]?.id ?? null;

  let transactions: StripeTransactionSummary[] = [];
  let hasMore = false;
  let livemode = false;
  let verifyError: string | null = null;
  let verifyOk = false;
  let currency: string | undefined;
  let availableBalance: number | undefined;

  if (selectedId) {
    const verify = await verifyStoredStripeConnection(selectedId);
    verifyOk = verify.ok;
    verifyError = verify.error ?? null;
    currency = verify.currency;
    availableBalance = verify.availableBalance;
    livemode = verify.livemode;

    if (verify.ok) {
      try {
        const result = await fetchStripeTransactions({
          connectionId: selectedId,
          limit: 25,
        });
        transactions = result.transactions;
        hasMore = result.hasMore;
        livemode = result.livemode;
      } catch (err) {
        verifyError =
          err instanceof Error ? err.message : "Failed to load transactions";
      }
    }
  }

  return {
    connections,
    selectedId,
    transactions,
    hasMore,
    livemode,
    verifyOk,
    verifyError,
    currency,
    availableBalance,
    qbConnected: Boolean(qbTokens),
    qbDepositAccounts: qbAccounts.accounts.filter((a) => a.active),
    qbPaymentMethods: qbPaymentMethods.paymentMethods.filter((p) => p.active),
    defaultPaymentRefTemplate: DEFAULT_STRIPE_QB_PAYMENT_REF_TEMPLATE,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "add") {
    const label = String(form.get("label") ?? "").trim();
    const secretKey = String(form.get("secretKey") ?? "").trim();

    if (!label || !secretKey) {
      return { error: "Label and secret key are required" };
    }

    try {
      const { connection, verify } = await createStripeConnection({
        label,
        secretKey,
        addedByUserId: user.id,
      });

      if (!verify.ok) {
        await deleteStripeConnection(connection.id);
        return { error: verify.error ?? "Could not verify Stripe key" };
      }

      throw redirect(`/integrations/stripe?account=${connection.id}`);
    } catch (err) {
      if (err instanceof Response) throw err;
      const message =
        err instanceof Error ? err.message : "Failed to add Stripe account";
      return { error: message };
    }
  }

  if (intent === "remove") {
    const id = String(form.get("connectionId") ?? "");
    if (id) await deleteStripeConnection(id);
    throw redirect("/integrations/stripe");
  }

  if (intent === "save-qb-mapping") {
    const connectionId = String(form.get("connectionId") ?? "").trim();
    if (!connectionId) {
      return { error: "Connection id required" };
    }
    await updateStripeConnectionQuickBooksMapping(connectionId, {
      quickbooksCustomerId:
        String(form.get("quickbooksCustomerId") ?? "").trim() || null,
      quickbooksDepositAccountId:
        String(form.get("quickbooksDepositAccountId") ?? "").trim() || null,
      quickbooksPaymentMethodId:
        String(form.get("quickbooksPaymentMethodId") ?? "").trim() || null,
      quickbooksPaymentRefTemplate:
        String(form.get("quickbooksPaymentRefTemplate") ?? "").trim() || null,
      quickbooksCustomerMemoTemplate:
        String(form.get("quickbooksCustomerMemoTemplate") ?? "").trim() || null,
    });
    throw redirect(`/integrations/stripe?account=${connectionId}`);
  }

  if (intent === "sync-payment-methods") {
    try {
      await syncQuickBooksPaymentMethods({
        triggeredBy: "app",
        userId: user.id,
      });
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Failed to sync payment methods",
      };
    }
    const connectionId = String(form.get("connectionId") ?? "").trim();
    throw redirect(
      connectionId
        ? `/integrations/stripe?account=${connectionId}`
        : "/integrations/stripe",
    );
  }

  return { error: "Unknown action" };
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function ConnectionCard({
  connection,
  selected,
}: {
  connection: StripeConnectionPublic;
  selected: boolean;
}) {
  return (
    <Link
      to={`/integrations/stripe?account=${connection.id}`}
      className={`block rounded-jamyang-lg border p-4 transition-colors ${
        selected
          ? "border-teal bg-teal/5"
          : "border-sand-dark/50 hover:border-sand-dark"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-dark">{connection.label}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Key ending ····{connection.keyLast4} ·{" "}
            {connection.livemode ? "Live" : "Test"}
          </p>
          {connection.stripeAccountId && (
            <p className="mt-1 font-mono text-xs text-ink-faint">
              {connection.stripeAccountId}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function StripeIntegration({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    connections,
    selectedId,
    transactions,
    hasMore,
    livemode,
    verifyOk,
    verifyError,
    currency,
    availableBalance,
    qbConnected,
    qbDepositAccounts,
    qbPaymentMethods,
    defaultPaymentRefTemplate,
  } = loaderData;

  const selected = connections.find((c) => c.id === selectedId);

  return (
    <AppPage
      title="Stripe accounts"
      description="Add secret keys for each Stripe account. Keys are encrypted in the database and never shown again after saving."
    >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <aside className="space-y-4">
            <h2 className="text-sm font-medium text-dark">Saved accounts</h2>
            {connections.length === 0 ? (
              <p className="text-sm text-ink-muted">No accounts yet.</p>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <ConnectionCard
                    key={c.id}
                    connection={c}
                    selected={c.id === selectedId}
                  />
                ))}
              </div>
            )}

            <div className="rounded-jamyang-lg border border-sand-dark/50 p-4">
              <h3 className="text-sm font-medium text-dark">Add account</h3>
              <Form method="post" className="mt-4 space-y-3">
                <input type="hidden" name="intent" value="add" />
                <div>
                  <label htmlFor="label" className="block text-xs text-ink-muted">
                    Label
                  </label>
                  <input
                    id="label"
                    name="label"
                    required
                    placeholder="e.g. Donations"
                    className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="secretKey"
                    className="block text-xs text-ink-muted"
                  >
                    Secret key
                  </label>
                  <input
                    id="secretKey"
                    name="secretKey"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder="sk_test_… sk_live_… rk_test_… or rk_live_…"
                    className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-sm font-mono"
                  />
                </div>
                {actionData?.error && (
                  <p role="alert" className="text-xs text-maroon">
                    {actionData.error}
                  </p>
                )}
                <SubmitButton
                  intent="add"
                  variant="primary"
                  className="w-full px-4 py-2"
                  loadingLabel="Saving & verifying…"
                >
                  Save & verify
                </SubmitButton>
              </Form>
            </div>
          </aside>

          <section className="min-w-0 space-y-6">
            {!selected && (
              <p className="text-sm text-ink-muted">
                Add a Stripe account to get started.
              </p>
            )}

            {selected && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-xl">{selected.label}</h2>
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove" />
                    <input
                      type="hidden"
                      name="connectionId"
                      value={selected.id}
                    />
                    <SubmitButton
                      intent="remove"
                      matchField="connectionId"
                      matchValue={selected.id}
                      variant="ghost"
                      loadingLabel="Removing…"
                    >
                      Remove account
                    </SubmitButton>
                  </Form>
                </div>

                <div
                  className={`rounded-jamyang-lg border p-6 ${
                    verifyOk
                      ? "border-jade/40 bg-jade/5"
                      : "border-maroon/30 bg-maroon/5"
                  }`}
                >
                  <h3 className="font-medium text-dark">
                    {verifyOk ? "Connected" : "Connection failed"}
                  </h3>
                  {verifyOk && (
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      {currency && (
                        <div>
                          <dt className="text-ink-faint">Default currency</dt>
                          <dd className="uppercase text-dark">{currency}</dd>
                        </div>
                      )}
                      {availableBalance != null && currency && (
                        <div>
                          <dt className="text-ink-faint">Available balance</dt>
                          <dd className="text-dark">
                            {formatMoney(availableBalance, currency)}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-ink-faint">Mode</dt>
                        <dd className="capitalize text-dark">
                          {livemode ? "Live" : "Test"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">Key</dt>
                        <dd className="font-mono text-dark">
                          ····{selected.keyLast4}
                        </dd>
                      </div>
                    </dl>
                  )}
                  {verifyError && (
                    <p className="mt-3 text-sm text-maroon">{verifyError}</p>
                  )}
                </div>

                {verifyOk && (
                  <>
                    <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
                      <h3 className="text-sm font-medium text-dark">
                        QuickBooks mapping
                      </h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        Sales receipts use this Stripe account for customer,
                        deposit to, payment method, reference no, and message.
                        Item, class, income account, and tax code come from the
                        Lotus product and synced QB item.
                      </p>
                      {!qbConnected ? (
                        <p className="mt-3 text-sm text-maroon">
                          Connect QuickBooks first.{" "}
                          <Link
                            to="/integrations/quickbooks"
                            className="text-teal underline"
                          >
                            QuickBooks settings
                          </Link>
                        </p>
                      ) : (
                        <>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value="sync-payment-methods"
                            />
                            <input
                              type="hidden"
                              name="connectionId"
                              value={selected.id}
                            />
                            <SubmitButton
                              intent="sync-payment-methods"
                              variant="pill"
                              loadingLabel="Syncing…"
                            >
                              Sync payment methods
                            </SubmitButton>
                          </Form>
                          {qbPaymentMethods.length === 0 && (
                            <span className="text-xs text-ink-muted">
                              No payment methods yet — sync from QuickBooks
                            </span>
                          )}
                        </div>
                        <Form
                          key={selected.id}
                          method="post"
                          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        >
                          <input type="hidden" name="intent" value="save-qb-mapping" />
                          <input type="hidden" name="connectionId" value={selected.id} />
                          <label className="flex flex-col gap-0.5 text-xs">
                            <span className="text-ink-muted">QB customer id</span>
                            <input
                              name="quickbooksCustomerId"
                              defaultValue={selected.quickbooksCustomerId ?? ""}
                              placeholder="QuickBooks Customer Id"
                              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5 text-xs">
                            <span className="text-ink-muted">Deposit to</span>
                            <select
                              name="quickbooksDepositAccountId"
                              defaultValue={selected.quickbooksDepositAccountId ?? ""}
                              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
                            >
                              <option value="">Select account…</option>
                              {qbDepositAccounts.map((a) => (
                                <option key={a.quickbooksId} value={a.quickbooksId}>
                                  {a.fullyQualifiedName ?? a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5 text-xs">
                            <span className="text-ink-muted">Payment method</span>
                            <select
                              name="quickbooksPaymentMethodId"
                              defaultValue={selected.quickbooksPaymentMethodId ?? ""}
                              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
                            >
                              <option value="">Select method…</option>
                              {qbPaymentMethods.map((p) => (
                                <option key={p.quickbooksId} value={p.quickbooksId}>
                                  {p.name}
                                  {p.type ? ` (${p.type})` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2">
                            <span className="text-ink-muted">
                              Reference no template (PaymentRefNum)
                            </span>
                            <input
                              name="quickbooksPaymentRefTemplate"
                              defaultValue={
                                selected.quickbooksPaymentRefTemplate ??
                                defaultPaymentRefTemplate
                              }
                              placeholder={defaultPaymentRefTemplate}
                              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5 text-xs sm:col-span-2 lg:col-span-3">
                            <span className="text-ink-muted">
                              Message fallback (CustomerMemo)
                            </span>
                            <input
                              name="quickbooksCustomerMemoTemplate"
                              defaultValue={
                                selected.quickbooksCustomerMemoTemplate ?? ""
                              }
                              placeholder="Used only when no community member email"
                              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
                            />
                          </label>
                          <div className="sm:col-span-2 lg:col-span-3">
                            <SubmitButton
                              intent="save-qb-mapping"
                              variant="pill"
                              loadingLabel="Saving…"
                            >
                              Save mapping
                            </SubmitButton>
                          </div>
                        </Form>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h3 className="text-lg">Recent balance transactions</h3>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <Link
                          to={
                            selectedId
                              ? `/integrations/stripe/transactions?account=${selectedId}`
                              : "/integrations/stripe/transactions"
                          }
                          className="text-teal underline-offset-2 hover:underline"
                        >
                          All transactions
                        </Link>
                        {selectedId && (
                          <a
                            href={`/api/stripe/transactions?account=${selectedId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal underline-offset-2 hover:underline"
                          >
                            JSON API
                          </a>
                        )}
                      </div>
                    </div>

                    {transactions.length === 0 ? (
                      <p className="text-sm text-ink-muted">
                        No balance transactions yet for this account.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
                        <table className="w-full min-w-[40rem] text-left text-sm">
                          <thead className="bg-surface text-dark">
                            <tr>
                              <th className="px-4 py-3 font-medium">Date</th>
                              <th className="px-4 py-3 font-medium">Type</th>
                              <th className="px-4 py-3 font-medium">
                                Description
                              </th>
                              <th className="px-4 py-3 font-medium text-right">
                                Amount
                              </th>
                              <th className="px-4 py-3 font-medium text-right">
                                Net
                              </th>
                              <th className="px-4 py-3 font-medium text-right">
                                Fee
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
                            {transactions.map((tx) => (
                              <tr key={tx.id}>
                                <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                                  {new Date(tx.created).toLocaleString("en-GB")}
                                </td>
                                <td className="px-4 py-3 capitalize">{tx.type}</td>
                                <td className="max-w-xs truncate px-4 py-3 text-ink-muted">
                                  {tx.description ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                  {formatMoney(tx.amount, tx.currency)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                  {formatMoney(tx.net, tx.currency)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-ink-muted">
                                  {formatMoney(tx.fee, tx.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {hasMore && (
                      <p className="text-sm text-ink-muted">
                        More transactions available — pagination coming next.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
    </AppPage>
  );
}
