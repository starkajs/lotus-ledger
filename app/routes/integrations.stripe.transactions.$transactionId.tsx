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
  saveProductMatchRuleAndClassifyUnmatched,
  setStripeTransactionProductManual,
} from "~/lib/product-classification.server";
import {
  extractStripeTransactionProductSignals,
  suggestProductMatchRule,
} from "~/lib/stripe-transaction-signals";
import { STRIPE_PRODUCT_LOCKED_REASON } from "~/lib/stripe-product-bulk-assign";
import { STRIPE_PRODUCT_MATCH_LABELS } from "~/lib/stripe-transactions-filters";
import { getProductMatchRuleById, listProducts } from "~/lib/products.server";
import { getQuickBooksRefundReceiptByQuickbooksId } from "~/lib/quickbooks-refund-receipts.server";
import { getQuickBooksSalesReceiptByQuickbooksId } from "~/lib/quickbooks-sales-receipts.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { updateStripeTransactionQuickBooksDescription } from "~/lib/stripe-quickbooks-description-update.server";
import { clearStripeTransactionQuickBooksPush } from "~/lib/stripe-quickbooks-push-execute.server";
import { getStripeBalanceTransactionById } from "~/lib/stripe-balance-transactions.server";
import { planStripeQuickBooksPushForTransaction } from "~/lib/stripe-quickbooks-push-plan.server";
import { safeRedirectPath } from "~/lib/redirect";
import { adminPermissionError, isAdmin, requireUser } from "~/lib/session.server";
import {
  findLinkedWooCommerceOrderForStripeTransaction,
  setStripeTransactionProductFromWooCommerceOrder,
} from "~/lib/wc-stripe-order-link.server";
import {
  isStripeProductUnmatched,
  lotusProductIdForStripeFromWooCommerceOrder,
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

const RULE_FIELD_OPTIONS = [
  ["sku", "SKU"],
  ["line_item_1", "Line item 1"],
  ["line_items_summary", "Line items summary"],
  ["charge_description", "Charge description"],
  ["balance_description", "Balance description"],
  ["any", "Any text"],
] as const;

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
  const user = await requireUser(request);

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
  const returnTo = safeRedirectPath(
    url.searchParams.get("returnTo"),
    "/integrations/stripe/transactions",
  );

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
  let wcLotusProductAmbiguous = false;

  if (linkedWcOrder) {
    linkedWcOrderFull = await getWooCommerceOrderById(linkedWcOrder.id);
    if (linkedWcOrderFull) {
      const productId = lotusProductIdForStripeFromWooCommerceOrder({
        productId: linkedWcOrderFull.productId,
        lineCatalogProductIds: linkedWcOrderFull.lotusProducts
          .filter((product) => product.source === "line")
          .map((product) => product.catalogProductId),
      });
      if (productId) {
        const lotus = linkedWcOrderFull.lotusProducts.find(
          (product) => product.catalogProductId === productId,
        );
        wcLotusProductForCopy = {
          productId,
          code: lotus?.code ?? "—",
          name: lotus?.name ?? "Product",
        };
      } else if (linkedWcOrderFull.lotusProducts.length > 1) {
        wcLotusProductAmbiguous = true;
      }
    }
  }

  const ruleSaved = url.searchParams.get("ruleSaved") === "1";
  const ruleNotice = ruleSaved
    ? {
        created: url.searchParams.get("ruleCreated") !== "0",
        mapped: Number(url.searchParams.get("ruleMapped") ?? "0") || 0,
      }
    : null;

  const stripeUnmatched = isStripeProductUnmatched(tx);

  let linkedQuickBooksSalesReceipt: {
    lotusId: string;
    docNumber: string | null;
    txnDate: string | null;
  } | null = null;
  let linkedQuickBooksRefundReceipt: {
    lotusId: string;
    docNumber: string | null;
    txnDate: string | null;
  } | null = null;
  const tokens = await getQuickBooksTokens();
  if (tx.quickbooksRefundReceiptId) {
    const receipt = await getQuickBooksRefundReceiptByQuickbooksId(
      tx.quickbooksRefundReceiptId,
      tokens?.realmId,
    );
    if (receipt) {
      linkedQuickBooksRefundReceipt = {
        lotusId: receipt.id,
        docNumber: receipt.docNumber,
        txnDate: receipt.txnDate,
      };
    }
  }
  if (tx.quickbooksSalesReceiptId) {
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
    linkedQuickBooksRefundReceipt,
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
    wcLotusProductAmbiguous,
    ruleNotice,
    stripeUnmatched,
    canClearQuickBooksPush: isAdmin(user),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const returnTo = safeRedirectPath(
    String(form.get("returnTo") ?? ""),
    "/integrations/stripe/transactions",
  );

  const detailPath = `/integrations/stripe/transactions/${params.transactionId}`;
  const redirectUrl = `${detailPath}?returnTo=${encodeURIComponent(returnTo)}`;

  if (intent === "setProduct") {
    const productId = String(form.get("productId") ?? "");
    if (!productId) {
      return { scope: "product" as const, error: "Select a product" };
    }
    const saved = await setStripeTransactionProductManual(
      params.transactionId,
      productId,
      {
        triggeredBy: "app",
        userId: user.id,
      },
    );
    if (!saved.ok) {
      return { scope: "product" as const, error: saved.reason };
    }
    return redirect(redirectUrl);
  }

  if (intent === "saveRule") {
    const productId = String(form.get("productId") ?? "");
    const field = String(form.get("field") ?? "");
    const matchType = String(form.get("matchType") ?? "contains");
    const pattern = String(form.get("pattern") ?? "");
    const saved = await saveProductMatchRuleAndClassifyUnmatched({
      productId,
      field,
      matchType,
      pattern,
      audit: { triggeredBy: "app", userId: user.id },
    });
    if (!saved.ok) {
      return { scope: "rule" as const, error: saved.error };
    }
    const mapped = saved.result.matched + saved.result.fromWooCommerce;
    const target = new URL(redirectUrl, "http://localhost");
    target.searchParams.set("ruleSaved", "1");
    target.searchParams.set("ruleCreated", saved.created ? "1" : "0");
    target.searchParams.set("ruleMapped", String(mapped));
    return redirect(`${target.pathname}${target.search}`);
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

  if (intent === "update-qb-description") {
    const denied = adminPermissionError(user);
    if (denied) {
      return { scope: "qbDescription" as const, error: denied };
    }
    const result = await updateStripeTransactionQuickBooksDescription(
      params.transactionId,
    );
    if (!result.ok) {
      return { scope: "qbDescription" as const, error: result.message };
    }
    return {
      scope: "qbDescription" as const,
      description: result.description,
      documentId: result.documentId,
    };
  }

  if (intent === "clear-qb-push") {
    const denied = adminPermissionError(user);
    if (denied) {
      return { scope: "clearQbPush" as const, error: denied };
    }
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
    wcLotusProductAmbiguous,
    ruleNotice,
    stripeUnmatched,
    linkedQuickBooksSalesReceipt,
    linkedQuickBooksRefundReceipt,
    canClearQuickBooksPush,
  } = loaderData;
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const suggestedRule = suggestProductMatchRule(productSignals);
  const productStatusLabel = tx.productMatchStatus
    ? (STRIPE_PRODUCT_MATCH_LABELS[
        tx.productMatchStatus as keyof typeof STRIPE_PRODUCT_MATCH_LABELS
      ] ?? tx.productMatchStatus)
    : null;

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
                  Apply Lotus product from this order ({wcLotusProductForCopy.code})
                </SubmitButton>
              </Form>
            ) : stripeUnmatched && wcLotusProductAmbiguous ? (
              <p className="text-xs text-ink-muted">
                This order includes more than one Lotus product, so it is not
                applied automatically. Assign one product on the order, or save
                a match rule below.
              </p>
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
          {productStatusLabel && (
            <span className="ml-2">({productStatusLabel})</span>
          )}
        </p>
        <Form method="post" action={postAction} className="mt-4 space-y-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="matchType" value="contains" />
          <div>
            <h3 className="text-sm font-medium text-dark">Save a match rule</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Maps this text to a Lotus product. Other unmatched Stripe
              transactions with the same text are mapped now, and future syncs
              use the rule. A linked WooCommerce order still wins. QuickBooks
              uses the product&apos;s QuickBooks item. Manual assignments are
              left as they are. A charge already in QuickBooks keeps the Lotus
              product that was pushed.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Lotus product</span>
              <select
                name="productId"
                defaultValue={tx.productId ?? ""}
                className="min-w-[12rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                <option value="">— Select —</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} — {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Field</span>
              <select
                name="field"
                defaultValue={suggestedRule?.field ?? "line_item_1"}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                {RULE_FIELD_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Text</span>
              <input
                name="pattern"
                required
                defaultValue={suggestedRule?.pattern ?? ""}
                placeholder="Text that identifies this product"
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <SubmitButton
              intent="saveRule"
              variant="pill"
              loadingLabel="Saving rule…"
            >
              Save rule and map unmatched
            </SubmitButton>
          </div>
        </Form>
        {ruleNotice && (
          <p className="mt-2 text-sm text-jade" role="status">
            {ruleNotice.created
              ? "Saved the rule."
              : "That rule was already saved."}{" "}
            {ruleNotice.mapped === 0
              ? "No unmatched transactions used that text."
              : `Mapped ${ruleNotice.mapped} unmatched transaction${ruleNotice.mapped === 1 ? "" : "s"}.`}
          </p>
        )}
        {actionData?.scope === "rule" && actionData.error && (
          <p className="mt-2 text-sm text-maroon" role="alert">
            {actionData.error}
          </p>
        )}
        {tx.pushedToQuickbooks ? (
          <p className="mt-3 text-xs text-ink-muted">{STRIPE_PRODUCT_LOCKED_REASON}</p>
        ) : (
        <Form
          method="post"
          action={postAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">This transaction only</span>
            <select
              name="productId"
              defaultValue={tx.productId ?? ""}
              className="min-w-[12rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">— Select —</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} — {product.name}
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
        )}
        {tx.pushedToQuickbooks ? null : (
        <p className="mt-1 text-xs text-ink-faint">
          Manual assignment does not create a rule.
        </p>
        )}
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
        <p className="mt-1 text-xs text-ink-faint">
          Re-classify on this page replaces a manual assignment when a
          WooCommerce order or a rule matches. A charge already in QuickBooks
          keeps its Lotus product.
        </p>
        {actionData?.scope === "product" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        {actionData?.scope === "clearQbPush" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        <DetailRow label="Matched by">
          {tx.productMatchStatus === "woocommerce" ? (
            <span>WooCommerce order</span>
          ) : tx.productMatchStatus === "manual" ? (
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
            Preview{" "}
            {pushPlan.documentKind === "refund_receipt"
              ? "Refund Receipt"
              : "Sales Receipt"}{" "}
            JSON
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
          <DetailRow label="QuickBooks description">
            <MultilineText
              value={
                pushPlan.refundReceipt?.Line[0]?.Description ??
                pushPlan.salesReceipt?.Line[0]?.Description
              }
            />
            {canClearQuickBooksPush &&
            (tx.quickbooksSalesReceiptId || tx.quickbooksRefundReceiptId) ? (
              <Form method="post" action={postAction} className="mt-2">
                <input type="hidden" name="returnTo" value={returnTo} />
                <SubmitButton
                  intent="update-qb-description"
                  variant="outline"
                  loadingLabel="Updating QuickBooks…"
                >
                  Update description in QuickBooks
                </SubmitButton>
              </Form>
            ) : null}
            {actionData?.scope === "qbDescription" && actionData.error ? (
              <p role="alert" className="mt-2 text-sm text-maroon">
                {actionData.error}
              </p>
            ) : null}
            {actionData?.scope === "qbDescription" &&
            "description" in actionData ? (
              <p role="status" className="mt-2 text-sm text-dark">
                QuickBooks description updated.
              </p>
            ) : null}
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
              {canClearQuickBooksPush &&
              (tx.pushedToQuickbooks === true ||
              tx.quickbooksSalesReceiptId ||
              tx.quickbooksRefundReceiptId) ? (
                <Form method="post" action={postAction} className="inline">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton
                    intent="clear-qb-push"
                    variant="ghost"
                    className="!px-0 !py-0 text-xs"
                    loadingLabel="Checking QuickBooks…"
                  >
                    Clear pushed flag
                  </SubmitButton>
                </Form>
              ) : null}
            </div>
            {tx.quickbooksSalesReceiptId || tx.quickbooksRefundReceiptId ? (
              <p className="mt-1 text-xs text-ink-faint">
                The flag clears only after QuickBooks reports that receipt is
                deleted.
              </p>
            ) : null}
          </DetailRow>
          {tx.quickbooksRefundReceiptId ? (
            <DetailRow label="QB refund receipt">
              <span className="font-mono text-xs">
                {tx.quickbooksRefundReceiptId}
              </span>
              {linkedQuickBooksRefundReceipt ? (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    to={`/integrations/quickbooks/refund-receipts/${linkedQuickBooksRefundReceipt.lotusId}`}
                    className="text-teal-dark underline"
                  >
                    {linkedQuickBooksRefundReceipt.docNumber
                      ? `Receipt ${linkedQuickBooksRefundReceipt.docNumber}`
                      : "View in Lotus"}
                  </Link>
                </>
              ) : (
                <span className="text-ink-faint">
                  {" "}
                  · not synced to Lotus yet — refresh Refund receipts
                </span>
              )}
            </DetailRow>
          ) : null}
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
