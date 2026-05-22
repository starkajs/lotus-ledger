import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions.$transactionId";
import { AppPage } from "~/components/app-page";
import { formatMoneyMinor } from "~/lib/money";
import { getStripeBalanceTransactionById } from "~/lib/stripe-balance-transactions.server";
import { requireUser } from "~/lib/session.server";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

export function meta({ data }: Route.MetaArgs) {
  const id = data?.tx.stripeBalanceTransactionId ?? "Transaction";
  return [
    { title: `${id} — Lotus Ledger` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const tx = await getStripeBalanceTransactionById(params.transactionId);
  if (!tx) {
    throw new Response("Transaction not found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("returnTo") ?? "/integrations/stripe/transactions";

  const stripeDashboardHost = tx.livemode
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";

  return {
    tx,
    returnTo,
    stripeDashboardUrl: `${stripeDashboardHost}/balance/all-activity`,
  };
}

export default function StripeTransactionDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { tx, returnTo, stripeDashboardUrl } = loaderData;

  return (
    <AppPage
      title="Transaction"
      description={tx.stripeBalanceTransactionId}
      actions={
        <Link
          to={returnTo}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Back to list
        </Link>
      }
    >
      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <dl>
          <DetailRow label="Stripe account">
            {tx.connectionLabel ?? "—"}
          </DetailRow>
          <DetailRow label="Community member">
            {tx.memberEmail ? (
              <Link
                to={`/community?q=${encodeURIComponent(tx.memberEmail)}`}
                className="text-teal hover:underline"
              >
                {tx.memberName ?? tx.memberEmail}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Stripe customer">
            {tx.stripeCustomerId ? (
              <span className="font-mono text-xs">{tx.stripeCustomerId}</span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Balance transaction ID">
            <span className="font-mono text-xs">{tx.stripeBalanceTransactionId}</span>
          </DetailRow>
          <DetailRow label="Source ID">
            {tx.sourceId ? (
              <span className="font-mono text-xs">{tx.sourceId}</span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Type">
            <span className="capitalize">{tx.type}</span>
          </DetailRow>
          <DetailRow label="Status">
            <span className="capitalize">{tx.status}</span>
          </DetailRow>
          <DetailRow label="Description">{tx.description ?? "—"}</DetailRow>
          <DetailRow label="Reporting category">
            {tx.reportingCategory ?? "—"}
          </DetailRow>
          <DetailRow label="Amount">
            <span className="font-mono">
              {formatMoneyMinor(tx.amount, tx.currency)} ({tx.amount}{" "}
              {tx.currency.toUpperCase()} minor units)
            </span>
          </DetailRow>
          <DetailRow label="Net">
            <span className="font-mono">
              {formatMoneyMinor(tx.net, tx.currency)} ({tx.net} minor units)
            </span>
          </DetailRow>
          <DetailRow label="Fee">
            <span className="font-mono">
              {formatMoneyMinor(tx.fee, tx.currency)} ({tx.fee} minor units)
            </span>
          </DetailRow>
          <DetailRow label="Currency">
            {tx.currency.toUpperCase()}
          </DetailRow>
          <DetailRow label="Created (Stripe)">
            {formatDateTime(tx.stripeCreatedAt)}
          </DetailRow>
          <DetailRow label="Available on">
            {formatDateTime(tx.availableOn)}
          </DetailRow>
          <DetailRow label="QuickBooks">
            {tx.pushedToQuickbooks ? (
              <span>
                Pushed
                {tx.quickbooksPushedAt
                  ? ` · ${formatDateTime(tx.quickbooksPushedAt)}`
                  : ""}
              </span>
            ) : (
              "Not pushed"
            )}
          </DetailRow>
          <DetailRow label="Synced to Lotus">
            {formatDateTime(tx.createdAt)}
          </DetailRow>
          <DetailRow label="Last updated">
            {formatDateTime(tx.updatedAt)}
          </DetailRow>
          <DetailRow label="Internal ID">
            <span className="font-mono text-xs">{tx.id}</span>
          </DetailRow>
        </dl>
      </div>

      {tx.stripeRaw && (
        <details className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark sm:px-6">
            Raw Stripe API response
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-sand-dark/40 px-4 py-3 text-xs text-ink-muted sm:px-6">
            {JSON.stringify(tx.stripeRaw, null, 2)}
          </pre>
        </details>
      )}

      <p className="mt-4 text-sm text-ink-muted">
        <a
          href={stripeDashboardUrl}
          target="_blank"
          rel="noreferrer"
          className="text-teal underline-offset-2 hover:underline"
        >
          Open Stripe balance activity
        </a>{" "}
        and search for{" "}
        <code className="font-mono text-xs text-dark">
          {tx.stripeBalanceTransactionId}
        </code>
        .
      </p>
    </AppPage>
  );
}
