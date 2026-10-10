import { extractStripeTransactionProductSignals } from "~/lib/stripe-transaction-signals";

/** QuickBooks line Description limit. */
const QUICKBOOKS_LINE_DESCRIPTION_MAX = 4000;

function productLabel(
  productCode: string | null | undefined,
  productName: string | null | undefined,
): string | null {
  const code = productCode?.trim();
  const name = productName?.trim();
  if (code && name && code !== name) return `${code} · ${name}`;
  return code || name || null;
}

function addPart(parts: string[], value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return;
  const key = text.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === key)) return;
  parts.push(text);
}

/**
 * Text stored on the QuickBooks line Description when a Stripe transaction
 * is transferred. Product first, then the Stripe detail that is not already
 * the product name.
 */
export function transferredQuickBooksDescription(input: {
  productCode?: string | null;
  productName?: string | null;
  description?: string | null;
  stripeRaw?: Record<string, unknown> | null;
  sku?: string | null;
  wcOrderId?: number | null;
  orderKey?: string | null;
  isRefund: boolean;
}): string {
  const signals = extractStripeTransactionProductSignals({
    stripeRaw: input.stripeRaw,
    description: input.description,
    sku: input.sku,
  });
  const parts: string[] = [];
  addPart(parts, productLabel(input.productCode, input.productName));
  addPart(
    parts,
    signals.description?.trim() ||
      signals.chargeDescription?.trim() ||
      signals.balanceDescription?.trim() ||
      input.description?.trim(),
  );
  addPart(parts, signals.lineItem1);
  addPart(parts, signals.lineItemsSummary);
  addPart(parts, signals.sku ?? input.sku);
  if (input.wcOrderId != null) {
    addPart(parts, `WC order ${input.wcOrderId}`);
  } else if (input.orderKey?.trim()) {
    addPart(parts, `Order ${input.orderKey.trim()}`);
  }

  const text =
    parts.join(" | ") || (input.isRefund ? "Refund" : "Sale");
  if (text.length <= QUICKBOOKS_LINE_DESCRIPTION_MAX) return text;
  return `${text.slice(0, QUICKBOOKS_LINE_DESCRIPTION_MAX - 1)}…`;
}
