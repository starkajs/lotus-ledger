import type { ReactNode } from "react";
import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/integrations.stripe.transactions.$transactionId";
import { AppPage } from "~/components/app-page";
import { quickbooksPushStatus } from "~/lib/stripe-quickbooks.constants";
import { SubmitButton } from "~/components/submit-button";
import { formatMoneyMinor } from "~/lib/money";
import { runIntegrationJob } from "~/lib/integration-jobs.server";
import {
  canPushTransactionToQuickbooks,
  classifyStripeTransactionById,
  setStripeTransactionProductManual,
} from "~/lib/product-classification.server";
import { extractStripeTransactionProductSignals } from "~/lib/stripe-transaction-signals";
import { getProductMatchRuleById, listProducts } from "~/lib/products.server";
import { getQuickBooksSalesReceiptByQuickbooksId } from "~/lib/quickbooks-sales-receipts.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { clearStripeTransactionQuickBooksPush } from "~/lib/stripe-quickbooks-push-execute.server";
import { getStripeBalanceTransactionById } from "~/lib/stripe-balance-transactions.server";
import { planStripeQuickBooksPushForTransaction } from "~/lib/stripe-quickbooks-push-plan.server";
import { requireUser } from "~/lib/session.server";
import {
  findLinkedWooCommerceOrderForStripeTransaction,
  setStripeTransactionProductFromWooCommerceOrder,
} from "~/lib/wc-stripe-order-link.server";
import {
  isStripeProductUnmatched,
  primaryLotusProductIdFromWooCommerceOrder,
} from "~/lib/wc-stripe-order-link";
import { WooCommerceOrderLines } from "~/components/woocommerce-order-lines";
import { getWooCommerceOrderById } from "~/lib/woocommerce-orders.server";
import type { WooCommerceOrderRecord } from "~/lib/woocommerce-orders.server";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

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

function MultilineText({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words text-dark">{value}</span>
  );
}

function formatMatchedRuleLabel(rule: {
  priority: number;
  field: string;
  matchType: string;
  pattern: string;
  productCode: string;
  productName: string;
}) {
  return `Priority ${rule.priority} · ${rule.field} · ${rule.matchType} · “${rule.pattern}” → ${rule.productCode} (${rule.productName})`;
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

  const products = await listProducts({ activeOnly: true });
  const pushCheck = canPushTransactionToQuickbooks(tx);
  const pushPlan = await planStripeQuickBooksPushForTransaction({
    transaction: tx,
  });
  const productSignals = extractStripeTransactionProductSignals({
    stripeRaw: tx.stripeRaw,
    description: tx.description,
    sku: tx.sku,
  });
  const matchedRule = tx.productMatchRuleId
    ? await getProductMatchRuleById(tx.productMatchRuleId)
    : null;

  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("returnTo") ?? "/integrations/stripe/transactions";

  const stripeDashboardHost = tx.livemode
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";

  const linkedWcOrder = await findLinkedWooCommerceOrderForStripeTransaction(
    params.transactionId,
  );
  let linkedWcOrderFull: WooCommerceOrderRecord | null = null;
  let wcLotusProductForCopy: {
    productId: string;
    code: string;
    name: string;
  } | null = null;

  if (linkedWcOrder) {
    linkedWcOrderFull = await getWooCommerceOrderById(linkedWcOrder.id);
    if (linkedWcOrderFull) {
      const productId = primaryLotusProductIdFromWooCommerceOrder(linkedWcOrderFull);
      if (productId) {
        const lotus = linkedWcOrderFull.lotusProducts.find(
          (p) => p.catalogProductId === productId,
        );
        wcLotusProductForCopy = {
          productId,
          code: lotus?.code ?? "—",
          name: lotus?.name ?? "Product",
        };
      }
    }
  }

  const stripeUnmatched = isStripeProductUnmatched(tx);

  let linkedQuickBooksSalesReceipt: {
    lotusId: string;
    docNumber: string | null;
    txnDate: string | null;
  } | null = null;
  if (tx.quickbooksSalesReceiptId) {
    const tokens = await getQuickBooksTokens();
    const receipt = await getQuickBooksSalesReceiptByQuickbooksId(
      tx.quickbooksSalesReceiptId,
      tokens?.realmId,
    );
    if (receipt) {
      linkedQuickBooksSalesReceipt = {
        lotusId: receipt.id,
        docNumber: receipt.docNumber,
        txnDate: receipt.txnDate,
      };
    }
  }

  return {
    tx,
    linkedQuickBooksSalesReceipt,
    products,
    productSignals,
    matchedRule,
    pushCheck,
    pushPlan,
    returnTo,
    stripeDashboardUrl: `${stripeDashboardHost}/balance/all-activity`,
    linkedWcOrder,
    linkedWcOrderFull,
    wcLotusProductForCopy,
    stripeUnmatched,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const returnTo = String(form.get("returnTo") ?? "/integrations/stripe/transactions");

  const detailPath = `/integrations/stripe/transactions/${params.transactionId}`;
  const redirectUrl = `${detailPath}?returnTo=${encodeURIComponent(returnTo)}`;

  if (intent === "setProduct") {
    const productId = String(form.get("productId") ?? "");
    if (!productId) {
      return { scope: "product" as const, error: "Select a product" };
    }
    await setStripeTransactionProductManual(params.transactionId, productId, {
      triggeredBy: "app",
      userId: user.id,
    });
    return redirect(redirectUrl);
  }

  if (intent === "copyProductFromWc") {
    const wcOrderId = String(form.get("wcOrderId") ?? "").trim();
    if (!wcOrderId) {
      return { scope: "wcProduct" as const, error: "Missing WooCommerce order" };
    }
    const result = await setStripeTransactionProductFromWooCommerceOrder(
      params.transactionId,
      wcOrderId,
      { triggeredBy: "app", userId: user.id },
    );
    if (!result.ok) {
      return { scope: "wcProduct" as const, error: result.reason };
    }
    return redirect(redirectUrl);
  }

  if (intent === "clear-qb-push") {
    const result = await clearStripeTransactionQuickBooksPush(params.transactionId);
    if (!result.ok) {
      return { scope: "clearQbPush" as const, error: result.reason };
    }
    return redirect(redirectUrl);
  }

  if (intent === "reclassify") {
    await runIntegrationJob(
      {
        jobType: "stripe_transactions_classify",
        triggeredBy: "app",
        userId: user.id,
        options: { transactionId: params.transactionId, single: true },
      },
      async (jobId) => {
        await classifyStripeTransactionById(params.transactionId, {
          force: true,
          audit: {
            triggeredBy: "app",
            userId: user.id,
            jobRunId: jobId,
            action: "classify",
          },
        });
      },
    );
    return redirect(redirectUrl);
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function StripeTransactionDetailPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    tx,
    products,
    productSignals,
    matchedRule,
    pushCheck,
    pushPlan,
    returnTo,
    stripeDashboardUrl,
    linkedWcOrder,
    linkedWcOrderFull,
    wcLotusProductForCopy,
    stripeUnmatched,
    linkedQuickBooksSalesReceipt,
  } = loaderData;
  const location = useLocation();
  const postAction = location.pathname + location.search;

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
      <div className="mb-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">WooCommerce order</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Matched when Stripe charge metadata{" "}
          <span className="font-mono">order_key</span> equals the WooCommerce
          order key.
        </p>
        {tx.orderKey ? (
          <p className="mt-2 text-xs text-ink-muted">
            Order key:{" "}
            <span className="font-mono text-dark">{tx.orderKey}</span>
          </p>
        ) : null}
        {linkedWcOrder ? (
          <div className="mt-3 space-y-3 text-sm">
            <p>
              <span className="mr-2 inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium text-jade">
                Linked
              </span>
              <Link
                to={`/integrations/woocommerce/orders/${linkedWcOrder.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className="font-medium text-teal hover:underline"
              >
                WC order #{linkedWcOrder.orderNumber ?? linkedWcOrder.wcOrderId}
              </Link>
              <span className="text-ink-muted">
                {" "}
                · {linkedWcOrder.status.replace(/-/g, " ")} ·{" "}
                {formatWooCommerceMoneyMinor(
                  linkedWcOrder.totalMinor,
                  linkedWcOrder.currency,
                )}
              </span>
            </p>
            {linkedWcOrderFull && (
              <div>
                <h3 className="text-xs font-medium text-ink-muted">Order lines</h3>
                <div className="mt-2">
                  <WooCommerceOrderLines
                    lineItems={linkedWcOrderFull.lineItems}
                    lineSummary={linkedWcOrderFull.lineSummary}
                    currency={linkedWcOrderFull.currency}
                  />
                </div>
              </div>
            )}
            {stripeUnmatched && wcLotusProductForCopy ? (
              <Form
                method="post"
                action={postAction}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="returnTo" value={returnTo} />
                <input
                  type="hidden"
                  name="wcOrderId"
                  value={linkedWcOrder.id}
                />
                <SubmitButton
                  intent="copyProductFromWc"
                  variant="pill"
                  loadingLabel="Applying…"
                >
                  Use Lotus product from WC order ({wcLotusProductForCopy.code})
                </SubmitButton>
              </Form>
            ) : stripeUnmatched && linkedWcOrder ? (
              <p className="text-xs text-ink-muted">
                Linked order has no Lotus product to copy — assign one on the
                WC order first.
              </p>
            ) : null}
          </div>
        ) : tx.orderKey ? (
          <p className="mt-3 text-sm text-ink-muted">
            No synced WooCommerce order with this order key.
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            No order key on this Stripe transaction (metadata may be missing).
          </p>
        )}
        {actionData?.scope === "wcProduct" && actionData.error && (
          <p className="mt-2 text-sm text-maroon" role="alert">
            {actionData.error}
          </p>
        )}
      </div>

      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Product</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {tx.productName
            ? `${tx.productCode} — ${tx.productName}`
            : "Not assigned"}
          {tx.productMatchStatus && (
            <span className="ml-2 capitalize">({tx.productMatchStatus})</span>
          )}
        </p>
        <Form
          method="post"
          action={postAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Assign product</span>
            <select
              name="productId"
              defaultValue={tx.productId ?? ""}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[12rem]"
            >
              <option value="">— Select —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton
            intent="setProduct"
            variant="pill"
            loadingLabel="Saving…"
          >
            Save (manual)
          </SubmitButton>
        </Form>
        <Form method="post" action={postAction} className="mt-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton
            intent="reclassify"
            variant="pill"
            loadingLabel="Re-classifying…"
          >
            Re-classify
          </SubmitButton>
        </Form>
        {actionData?.scope === "product" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        {actionData?.scope === "clearQbPush" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        <DetailRow label="Matched by rule">
          {tx.productMatchStatus === "manual" ? (
            <span className="text-ink-muted">Manual assignment (no rule)</span>
          ) : matchedRule ? (
            <span className="text-sm text-dark">
              {formatMatchedRuleLabel(matchedRule)}
            </span>
          ) : tx.productMatchStatus === "ambiguous" ? (
            <span className="text-amber-700">Ambiguous — multiple rules matched</span>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </DetailRow>
        <p className="mt-3 text-xs text-ink-muted">
          QuickBooks push:{" "}
          {pushPlan.ready ? (
            <span className="text-jade">Ready (Stripe account + product)</span>
          ) : (
            <span className="text-maroon">
              {[pushCheck.ok ? null : pushCheck.reason, ...pushPlan.issues]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {" · "}
          <Link
            to={`/integrations/stripe/transactions/quickbooks-push?preview=${tx.id}`}
            className="text-teal hover:underline"
          >
            Preview Sales Receipt JSON
          </Link>
        </p>
      </div>

      <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">
          Stripe text used for classification
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          From the synced balance transaction and expanded charge metadata.
        </p>
        <dl className="mt-3">
          <DetailRow label="Description">
            <MultilineText value={productSignals.description} />
          </DetailRow>
          {productSignals.chargeDescription &&
            productSignals.chargeDescription !==
              productSignals.balanceDescription && (
              <DetailRow label="Balance description">
                <MultilineText value={productSignals.balanceDescription} />
              </DetailRow>
            )}
          <DetailRow label="Line Item 1">
            <MultilineText value={productSignals.lineItem1} />
          </DetailRow>
          <DetailRow label="Line items summary">
            <MultilineText value={productSignals.lineItemsSummary} />
          </DetailRow>
          <DetailRow label="WC order key (metadata)">
            <MultilineText value={tx.orderKey} />
          </DetailRow>
          <DetailRow label="SKU">
            <MultilineText value={productSignals.sku} />
            {!productSignals.sku && (
              <p className="mt-1 text-xs text-ink-faint">
                Not provided by Stripe yet; stored when charge metadata includes
                sku, SKU, or product_sku.
              </p>
            )}
          </DetailRow>
        </dl>
      </div>

      <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <dl>
          <DetailRow label="Stripe account">
            {tx.connectionLabel ?? "—"}
          </DetailRow>
          <DetailRow label="Community member">
            {tx.communityMemberId ? (
              <Link
                to={`/community/${tx.communityMemberId}`}
                className="text-teal hover:underline"
              >
                {tx.memberName ?? tx.memberEmail ?? "View member"}
              </Link>
            ) : tx.memberEmail ? (
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
          <DetailRow label="Payment intent ID">
            {tx.stripePaymentIntentId ? (
              <span className="font-mono text-xs">{tx.stripePaymentIntentId}</span>
            ) : (
              <span className="text-ink-faint">
                — (re-sync or run backfill if charge source was not expanded)
              </span>
            )}
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
          <DetailRow label="Description (stored)">
            <MultilineText value={tx.description} />
          </DetailRow>
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
            <div className="flex flex-wrap items-center gap-2">
              {quickbooksPushStatus(tx.pushedToQuickbooks) === "yes" ? (
                <span>
                  Pushed
                  {tx.quickbooksPushedAt
                    ? ` · ${formatDateTime(tx.quickbooksPushedAt)}`
                    : ""}
                </span>
              ) : quickbooksPushStatus(tx.pushedToQuickbooks) === "na" ? (
                "N/A (before 1 Apr 2026)"
              ) : (
                "Not pushed"
              )}
              {tx.pushedToQuickbooks === true || tx.quickbooksSalesReceiptId ? (
                <Form method="post" action={postAction} className="inline">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton
                    intent="clear-qb-push"
                    variant="ghost"
                    className="!px-0 !py-0 text-xs"
                    loadingLabel="Clearing…"
                  >
                    Clear pushed flag
                  </SubmitButton>
                </Form>
              ) : null}
            </div>
          </DetailRow>
          {tx.quickbooksSalesReceiptId ? (
            <DetailRow label="QB sales receipt">
              <span className="font-mono text-xs">
                {tx.quickbooksSalesReceiptId}
              </span>
              {linkedQuickBooksSalesReceipt ? (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    to={`/integrations/quickbooks/sales-receipts/${linkedQuickBooksSalesReceipt.lotusId}`}
                    className="text-teal-dark underline"
                  >
                    {linkedQuickBooksSalesReceipt.docNumber
                      ? `Receipt ${linkedQuickBooksSalesReceipt.docNumber}`
                      : "View in Lotus"}
                  </Link>
                </>
              ) : (
                <span className="text-ink-faint">
                  {" "}
                  · not synced to Lotus yet
                </span>
              )}
            </DetailRow>
          ) : null}
          <DetailRow label="Product classified">
            {formatDateTime(tx.productMatchedAt)}
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
