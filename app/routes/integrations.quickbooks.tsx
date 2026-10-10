import { Form, Link, redirect, useLocation, useSearchParams } from "react-router";
import type { Route } from "./+types/integrations.quickbooks";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import {
  getAppUrl,
  getQuickBooksEnvironment,
  isQuickBooksConfigured,
} from "~/lib/env.server";
import { adminPermissionError, isAdmin, requireUser } from "~/lib/session.server";
import {
  fetchQuickBooksInvoices,
  verifyQuickBooksConnection,
  type QuickBooksInvoiceSummary,
} from "~/lib/quickbooks-api.server";
import { clearQuickBooksTokens, getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { getQuickBooksRedirectUri } from "~/lib/quickbooks-oauth.server";
import { refreshAllQuickBooks } from "~/lib/quickbooks-refresh-all.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks connection — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const canManageQuickBooks = isAdmin(user);
  const appConfigured = isQuickBooksConfigured();
  const tokens = await getQuickBooksTokens();
  const connected = Boolean(tokens);

  if (!appConfigured) {
    return {
      appConfigured: false as const,
      connected: false,
      connection: null,
      invoices: [] as QuickBooksInvoiceSummary[],
      environment: getQuickBooksEnvironment(),
      redirectUri: getQuickBooksRedirectUri(),
      appUrl: getAppUrl(),
      canManageQuickBooks,
    };
  }

  const redirectUri = getQuickBooksRedirectUri();
  const appUrl = getAppUrl();

  if (!connected) {
    return {
      appConfigured: true as const,
      connected: false,
      connection: null,
      invoices: [] as QuickBooksInvoiceSummary[],
      environment: getQuickBooksEnvironment(),
      redirectUri,
      appUrl,
      canManageQuickBooks,
    };
  }

  try {
    const connection = await verifyQuickBooksConnection();
    const invoices = connection.ok ? await fetchQuickBooksInvoices(25) : [];

    return {
      appConfigured: true as const,
      connected: true,
      connection,
      invoices,
      environment: getQuickBooksEnvironment(),
      redirectUri,
      appUrl,
      canManageQuickBooks,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      appConfigured: true as const,
      connected: true,
      connection: {
        ok: false as const,
        environment: getQuickBooksEnvironment(),
        error: message,
      },
      invoices: [] as QuickBooksInvoiceSummary[],
      environment: getQuickBooksEnvironment(),
      redirectUri,
      appUrl,
      canManageQuickBooks,
    };
  }
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  if (formData.get("intent") === "disconnect") {
    const denied = adminPermissionError(user);
    if (denied) {
      throw new Response(denied, { status: 403 });
    }
    await clearQuickBooksTokens();
    return redirect("/integrations/quickbooks");
  }
  if (formData.get("intent") === "refresh-all") {
    const tokens = await getQuickBooksTokens();
    if (!tokens) {
      return {
        scope: "refresh-all" as const,
        error: "QuickBooks is not connected.",
      };
    }
    const steps = await refreshAllQuickBooks({
      triggeredBy: "app",
      userId: user.id,
    });
    return { scope: "refresh-all" as const, steps };
  }
  return redirect("/integrations/quickbooks");
}

function describeRefreshStep(step: {
  ok: boolean;
  total: number | null;
  created: number | null;
  updated: number | null;
  tombstoned: number | null;
  error: string | null;
}) {
  if (!step.ok) return step.error ?? "Refresh failed";
  const removed =
    step.tombstoned && step.tombstoned > 0
      ? `, ${step.tombstoned} marked removed`
      : "";
  return `${step.total} rows (${step.created} new, ${step.updated} updated${removed})`;
}

function formatMoney(amount: number, currency: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency ?? "GBP",
  }).format(amount);
}

export default function QuickBooksIntegration({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const {
    appConfigured,
    connected,
    connection,
    invoices,
    environment,
    redirectUri,
    appUrl,
    canManageQuickBooks,
  } = loaderData;

  const justConnected = searchParams.get("connected") === "1";
  const error = searchParams.get("error");

  const headerActions =
    canManageQuickBooks && appConfigured && !connected ? (
      <a
        href="/integrations/quickbooks/connect"
        className="rounded-jamyang-pill bg-maroon px-5 py-2 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark"
      >
        Connect QuickBooks
      </a>
    ) : null;

  return (
    <AppPage
      title="QuickBooks Online"
      description={
        <>
          Intuit requires OAuth (there is no long-lived API key). Click connect
          once — like Make.com — and we store a refresh token locally for
          Jamyang&apos;s company.
        </>
      }
      actions={headerActions}
    >
        {justConnected && (
          <p
            role="status"
            className="mt-6 rounded-jamyang border border-jade/40 bg-jade/5 px-4 py-3 text-sm text-dark"
          >
            QuickBooks connected successfully.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-jamyang border border-maroon/30 bg-maroon/5 px-4 py-3 text-sm text-maroon space-y-3"
          >
            <p>{error}</p>
            {error.toLowerCase().includes("redirect_uri") && appConfigured && (
              <div className="rounded-jamyang bg-dark/5 p-3 text-dark">
                <p className="font-medium">Register this exact URI in Intuit</p>
                <p className="mt-2 font-mono text-xs break-all text-maroon">
                  {redirectUri}
                </p>
                <p className="mt-2 text-ink-muted text-xs">
                  developer.intuit.com → your app → <strong>Keys &amp; OAuth</strong> →
                  Development → <strong>Redirect URIs</strong>. No trailing slash. Then
                  restart <code>npm run dev</code> if you changed <code>APP_URL</code>.
                </p>
              </div>
            )}
          </div>
        )}

        {appConfigured && (
          <div className="mt-6 rounded-jamyang border border-teal/30 bg-teal/5 px-4 py-3 text-sm">
            <p className="font-medium text-dark">Redirect URI (must match Intuit exactly)</p>
            <p className="mt-2 font-mono text-xs break-all text-teal">{redirectUri}</p>
            <p className="mt-2 text-ink-muted">
              <code className="text-dark">APP_URL</code> in .env should be the site root only
              (e.g. <code className="text-dark">http://localhost:5174</code>), not the callback
              path. Current base: <code className="text-dark">{appUrl}</code>
            </p>
          </div>
        )}

        {!appConfigured && (
          <div
            role="alert"
            className="mt-8 rounded-jamyang-lg border border-maroon/30 bg-maroon/5 p-6"
          >
            <h2 className="font-medium text-maroon">App credentials required</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Create an app at{" "}
              <a
                href="https://developer.intuit.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline-offset-2 hover:underline"
              >
                developer.intuit.com
              </a>{" "}
              and add to <code className="text-dark">.env</code>:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-jamyang bg-dark p-4 text-sm text-sand">
              {`QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_ENVIRONMENT=sandbox
APP_URL=http://localhost:5174`}
            </pre>
            <p className="mt-4 text-sm text-ink-muted">
              Redirect URI in Intuit (must match exactly):{" "}
              <code className="break-all text-dark">{redirectUri}</code>
            </p>
          </div>
        )}

        {appConfigured && !connected && (
          <div className="mt-8 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
            <h2 className="font-medium text-dark">Ready to connect</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Environment: <strong className="capitalize">{environment}</strong>
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {canManageQuickBooks
                ? "You will sign in to Intuit and authorise read access to Jamyang's QuickBooks company. Tokens are saved encrypted in the database so the web app and scheduled cron jobs share the same connection."
                : "An administrator connects QuickBooks. You can still read receipts and reconcile."}
            </p>
          </div>
        )}

        {appConfigured && connected && (
          <div className="mt-8 space-y-8">
            <div
              className={`rounded-jamyang-lg border p-6 ${
                connection?.ok
                  ? "border-jade/40 bg-jade/5"
                  : "border-maroon/30 bg-maroon/5"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="font-medium text-dark">
                  {connection?.ok ? "Connected" : "Connection issue"}
                </h2>
                {canManageQuickBooks ? (
                <Form method="post" action={postAction}>
                  <SubmitButton
                    intent="disconnect"
                    variant="outline"
                    loadingLabel="Disconnecting…"
                  >
                    Disconnect
                  </SubmitButton>
                </Form>
                ) : null}
              </div>
              {connection?.ok && (
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {connection.companyName && (
                    <div>
                      <dt className="text-ink-faint">Company</dt>
                      <dd className="text-dark">{connection.companyName}</dd>
                    </div>
                  )}
                  {connection.realmId && (
                    <div>
                      <dt className="text-ink-faint">Company ID</dt>
                      <dd className="font-mono text-dark">{connection.realmId}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-faint">Environment</dt>
                    <dd className="capitalize text-dark">{connection.environment}</dd>
                  </div>
                </dl>
              )}
              {connection && !connection.ok && connection.error && (
                <p className="mt-3 text-sm text-maroon">{connection.error}</p>
              )}
            </div>

            {connection?.ok && (
              <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl">QuickBooks data</h2>
                    <p className="mt-2 max-w-xl text-sm text-ink-muted">
                      Refresh all pulls accounts, classes, VAT codes, products
                      and services, payment methods, and sales and refund
                      receipts. Receipts include any days missed since the last
                      complete sync.
                    </p>
                  </div>
                  <Form method="post" action={postAction}>
                    <SubmitButton
                      intent="refresh-all"
                      variant="pill"
                      loadingLabel="Refreshing all…"
                    >
                      Refresh all
                    </SubmitButton>
                  </Form>
                </div>
                {actionData?.scope === "refresh-all" && actionData.error ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-jamyang border border-maroon/30 bg-maroon/5 px-4 py-3 text-sm text-maroon"
                  >
                    {actionData.error}
                  </p>
                ) : null}
                {actionData?.scope === "refresh-all" && actionData.steps ? (
                  <ul
                    role="status"
                    className="mt-4 space-y-1 rounded-jamyang border border-sand-dark/40 bg-surface px-4 py-3 text-sm"
                  >
                    {actionData.steps.map((step) => (
                      <li key={step.key} className={step.ok ? "text-dark" : "text-maroon"}>
                        <span className="font-medium">{step.label}:</span>{" "}
                        {describeRefreshStep(step)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="mt-4 flex flex-wrap gap-3 text-sm">
                  <li>
                    <Link
                      to="/integrations/quickbooks/accounts"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Chart of accounts
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/quickbooks/classes"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Classes
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/quickbooks/tax-codes"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      VAT codes
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/quickbooks/items"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Products &amp; services
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/quickbooks/sales-receipts"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Sales receipts
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/quickbooks/refund-receipts"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Refund receipts
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/integrations/stripe/transactions/quickbooks-push"
                      className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                    >
                      Stripe → QB push
                    </Link>
                  </li>
                </ul>
              </section>
            )}

            {connection?.ok && (
              <section>
                <h2 className="text-xl">Recent invoices</h2>
                {invoices.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    No invoices returned yet.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="bg-surface text-dark">
                        <tr>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Number</th>
                          <th className="px-4 py-3 font-medium">Customer</th>
                          <th className="px-4 py-3 font-medium text-right">
                            Total
                          </th>
                          <th className="px-4 py-3 font-medium text-right">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                              {inv.txnDate ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {inv.docNumber ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-ink-muted">
                              {inv.customerName ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatMoney(inv.total, inv.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-ink-muted">
                              {formatMoney(inv.balance, inv.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
    </AppPage>
  );
}
