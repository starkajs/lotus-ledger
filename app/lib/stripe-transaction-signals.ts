/** Client-safe helpers to read classification text from Stripe balance txn JSON. */

export type ClassificationField =
  | "balance_description"
  | "charge_description"
  | "line_item_1"
  | "line_items_summary"
  | "donorbox_metadata"
  | "metadata_all"
  | "sku"
  | "any";

export type ClassificationText = {
  field: ClassificationField;
  value: string;
};

export type StripeTransactionProductSignals = {
  /** Charge description if expanded, otherwise balance transaction description. */
  description: string | null;
  balanceDescription: string | null;
  chargeDescription: string | null;
  lineItem1: string | null;
  lineItemsSummary: string | null;
  sku: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function paymentIntentIdFromChargeLike(
  charge: Record<string, unknown>,
): string | null {
  const pi = charge.payment_intent;
  if (typeof pi === "string" && pi.startsWith("pi_")) {
    return pi;
  }
  const expanded = asRecord(pi);
  if (expanded && typeof expanded.id === "string" && expanded.id.startsWith("pi_")) {
    return expanded.id;
  }
  return null;
}

/**
 * Payment intent id (`pi_…`) from synced balance txn JSON (expanded source).
 * Matches what QuickBooks has historically used as Tracking # / external id.
 */
export function extractPaymentIntentIdFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): string | null {
  if (!stripeRaw) return null;

  const source = stripeRaw.source;
  if (typeof source === "string") {
    return source.startsWith("pi_") ? source : null;
  }

  const src = asRecord(source);
  if (!src) return null;

  if (src.object === "payment_intent" && typeof src.id === "string") {
    return src.id.startsWith("pi_") ? src.id : null;
  }

  if (src.object === "charge") {
    return paymentIntentIdFromChargeLike(src);
  }

  if (src.object === "refund") {
    const charge = src.charge;
    if (typeof charge === "string") return null;
    const chargeObj = asRecord(charge);
    if (chargeObj) {
      return paymentIntentIdFromChargeLike(chargeObj);
    }
  }

  return null;
}

function chargeFromRaw(
  raw: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  const source = raw.source;
  if (!source || typeof source !== "object") return null;
  const obj = source as { object?: string };
  if (obj.object === "charge" || obj.object === "payment_intent") {
    return source as Record<string, unknown>;
  }
  return null;
}

/**
 * Read a dedicated SKU from expanded charge metadata when Stripe adds it.
 * Does not parse line_items_summary; use sku match rules for bracket codes.
 */
export function extractSkuFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): string | null {
  const charge = chargeFromRaw(stripeRaw ?? null);
  if (!charge) return null;
  const metadata = asRecord(charge.metadata);
  if (!metadata) return null;
  return (
    metadataString(metadata.sku) ??
    metadataString(metadata.SKU) ??
    metadataString(metadata["product_sku"])
  );
}

/** Collect labeled strings from balance txn + expanded charge metadata. */
export function collectClassificationText(input: {
  description?: string | null;
  stripeRaw?: Record<string, unknown> | null;
  sku?: string | null;
}): ClassificationText[] {
  const texts: ClassificationText[] = [];
  const seen = new Set<string>();

  function add(field: ClassificationField, value: string | null | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = `${field}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    texts.push({ field, value: trimmed });
  }

  add("balance_description", input.description ?? null);
  add("sku", input.sku ?? extractSkuFromStripeRaw(input.stripeRaw));

  const charge = chargeFromRaw(input.stripeRaw ?? null);
  if (charge) {
    add("charge_description", metadataString(charge.description));
    const metadata = asRecord(charge.metadata);
    if (metadata) {
      add("line_item_1", metadataString(metadata["Line Item 1"]));
      add("line_items_summary", metadataString(metadata["line_items_summary"]));
      add(
        "donorbox_metadata",
        metadataString(metadata["donorbox_metadata"] ?? metadata["Donorbox Metadata"]),
      );
      for (const value of Object.values(metadata)) {
        add("metadata_all", metadataString(value));
      }
    }
  }

  const skuTexts = texts
    .filter((t) => t.field === "line_items_summary" || t.field === "line_item_1")
    .map((t) => t.value);
  for (const sku of skuTexts) {
    add("sku", sku);
  }

  return texts;
}

export function extractStripeTransactionProductSignals(input: {
  stripeRaw?: Record<string, unknown> | null;
  description?: string | null;
  sku?: string | null;
}): StripeTransactionProductSignals {
  const raw = input.stripeRaw ?? null;
  const balanceFromRaw =
    raw && typeof raw.description === "string" ? raw.description.trim() : null;
  const balanceDescription =
    balanceFromRaw || input.description?.trim() || null;

  const charge = chargeFromRaw(raw);
  const chargeDescription = charge
    ? metadataString(charge.description)
    : null;

  let lineItem1: string | null = null;
  let lineItemsSummary: string | null = null;
  if (charge) {
    const metadata = asRecord(charge.metadata);
    if (metadata) {
      lineItem1 = metadataString(metadata["Line Item 1"]);
      lineItemsSummary = metadataString(metadata["line_items_summary"]);
    }
  }

  const description = chargeDescription ?? balanceDescription;
  const sku = input.sku?.trim() || extractSkuFromStripeRaw(raw);

  return {
    description,
    balanceDescription,
    chargeDescription,
    lineItem1,
    lineItemsSummary,
    sku,
  };
}
