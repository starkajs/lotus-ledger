import { Link } from "react-router";
import type { Route } from "./+types/integrations.stripe";
import { getStripeSecretKey } from "~/lib/env.server";
import {
  fetchStripeTransactions,
  verifyStripeConnection,
  type StripeTransactionSummary,
} from "~/lib/stripe-transactions.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Stripe connection — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const configured = Boolean(getStripeSecretKey());

  if (!configured) {
    return {
      configured: false as const,
      connection: null,
      transactions: [] as StripeTransactionSummary[],
      hasMore: false,
      mode: null,
      error: null,
    };
  }

  try {
    const connection = await verifyStripeConnection();
    if (!connection.ok) {
      return {
        configured: true as const,
        connection,
        transactions: [] as StripeTransactionSummary[],
        hasMore: false,
        mode: connection.mode,
        error: connection.error ?? "Could not connect to Stripe",
      };
    }

    const { transactions, hasMore, mode } = await fetchStripeTransactions({
      limit: 25,
    });

    return {
      configured: true as const,
      connection,
      transactions,
      hasMore,
      mode,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      configured: true as const,
      connection: { ok: false as const, mode: "test" as const, error: message },
      transactions: [] as StripeTransactionSummary[],
      hasMore: false,
      mode: null,
      error: message,
    };
  }
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export default function StripeIntegration({ loaderData }: Route.ComponentProps) {
  const { configured, connection, transactions, hasMore, mode, error } =
    loaderData;

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-sand-dark/40 bg-surface-overlay/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="text-sm font-medium text-teal underline-offset-2 hover:underline"
          >
            ← Home
          </Link>
          <span className="text-sm text-ink-muted">Stripe validation</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl">Stripe connection</h1>
        <p className="mt-2 text-ink-muted">
          Testing with a single API key from <code className="text-dark">.env</code>.
          Multiple accounts will be stored in the database later.
        </p>

        {!configured && (
          <div
            role="alert"
            className="mt-8 rounded-jamyang-lg border border-maroon/30 bg-maroon/5 p-6"
          >
            <h2 className="font-medium text-maroon">Not configured</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Add to <code className="text-dark">.env</code>:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-jamyang bg-dark p-4 text-sm text-sand">
              {`STRIPE_SECRET_KEY=sk_test_...`}
            </pre>
            <p className="mt-4 text-sm text-ink-muted">
              Restart <code className="text-dark">npm run dev</code> after saving.
            </p>
          </div>
        )}

        {configured && (
          <div className="mt-8 space-y-6">
            <div
              className={`rounded-jamyang-lg border p-6 ${
                connection?.ok
                  ? "border-jade/40 bg-jade/5"
                  : "border-maroon/30 bg-maroon/5"
              }`}
            >
              <h2 className="font-medium text-dark">
                {connection?.ok ? "Connected" : "Connection failed"}
              </h2>
              {connection?.ok && (
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {connection.currency && (
                    <div>
                      <dt className="text-ink-faint">Default currency</dt>
                      <dd className="uppercase text-dark">{connection.currency}</dd>
                    </div>
                  )}
                  {connection.availableBalance != null && connection.currency && (
                    <div>
                      <dt className="text-ink-faint">Available balance</dt>
                      <dd className="text-dark">
                        {formatMoney(
                          connection.availableBalance,
                          connection.currency,
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-faint">Mode</dt>
                    <dd className="capitalize text-dark">{mode ?? connection.mode}</dd>
                  </div>
                </dl>
              )}
              {error && (
                <p className="mt-3 text-sm text-maroon">{error}</p>
              )}
            </div>

            {connection?.ok && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl">Recent balance transactions</h2>
                  <a
                    href="/api/stripe/transactions"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-teal underline-offset-2 hover:underline"
                  >
                    JSON API
                  </a>
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
                          <th className="px-4 py-3 font-medium">Description</th>
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
          </div>
        )}
      </main>
    </div>
  );
}
