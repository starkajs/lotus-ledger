/** Client-safe helpers to read classification text from Stripe balance txn JSON. */

import { normalizeCountryCode } from "~/lib/country-code";

export type StripeGuestBillingAddress = {
  countryCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type StripeGuestBillingInfo = {
  email: string;
  name: string | null;
  address: StripeGuestBillingAddress | null;
};

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

/** Expanded Charge object from balance txn `source` (not a bare PaymentIntent). */
export function chargeRecordFromStripeRaw(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  const source = raw.source;
  if (!source || typeof source !== "object") return null;
  const obj = source as { object?: string };

  if (obj.object === "charge") {
    return source as Record<string, unknown>;
  }

  if (obj.object === "payment_intent") {
    const latestCharge = (source as { latest_charge?: unknown }).latest_charge;
    if (latestCharge && typeof latestCharge === "object") {
      return latestCharge as Record<string, unknown>;
    }
  }

  if (obj.object === "refund") {
    const charge = (source as { charge?: unknown }).charge;
    if (charge && typeof charge === "object") {
      return charge as Record<string, unknown>;
    }
  }

  return null;
}

/** @deprecated Use chargeRecordFromStripeRaw — kept for classification text paths. */
function chargeFromRaw(
  raw: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const charge = chargeRecordFromStripeRaw(raw);
  if (charge) return charge;
  if (!raw) return null;
  const source = raw.source;
  if (!source || typeof source !== "object") return null;
  const obj = source as { object?: string };
  if (obj.object === "payment_intent") {
    return source as Record<string, unknown>;
  }
  return null;
}

function mergeGuestAddress(
  primary: StripeGuestBillingAddress | null,
  extra: StripeGuestBillingAddress | null,
): StripeGuestBillingAddress | null {
  if (!primary && !extra) return null;
  const base: StripeGuestBillingAddress = primary ?? {
    countryCode: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
  };
  if (!extra) return base;

  const fields: Array<keyof StripeGuestBillingAddress> = [
    "countryCode",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
  ];
  const merged = { ...base };
  for (const key of fields) {
    if (!merged[key] && extra[key]) {
      merged[key] = extra[key];
    }
  }
  const hasValue = fields.some((key) => merged[key]);
  return hasValue ? merged : null;
}

function donorboxBillingFromChargeRecord(
  charge: Record<string, unknown>,
): StripeGuestBillingInfo | null {
  const metadata = asRecord(charge.metadata);
  if (!metadata) return null;

  const email = metadataString(metadata.donorbox_email)?.toLowerCase();
  if (!email) return null;

  const first = metadataString(metadata.donorbox_first_name);
  const last = metadataString(metadata.donorbox_last_name);
  const name = [first, last].filter(Boolean).join(" ") || null;
  const city = metadataString(metadata.donorbox_city);
  const countryCode = normalizeCountryCode(
    metadataString(metadata.donorbox_country) ?? undefined,
  );

  const address =
    city || countryCode
      ? {
          countryCode,
          addressLine1: null,
          addressLine2: null,
          city,
          state: null,
          postalCode: null,
        }
      : null;

  return { email, name, address };
}

function billingDetailsFromChargeRecord(
  charge: Record<string, unknown>,
): StripeGuestBillingInfo | null {
  const billing = asRecord(charge.billing_details);
  if (!billing) return null;

  const email = metadataString(billing.email)?.toLowerCase();
  if (!email) return null;

  const addr = asRecord(billing.address);
  return {
    email,
    name: metadataString(billing.name),
    address: addr
      ? {
          countryCode: normalizeCountryCode(metadataString(addr.country) ?? undefined),
          addressLine1: metadataString(addr.line1),
          addressLine2: metadataString(addr.line2),
          city: metadataString(addr.city),
          state: metadataString(addr.state),
          postalCode: metadataString(addr.postal_code),
        }
      : null,
  };
}

function mergeGuestBilling(
  primary: StripeGuestBillingInfo | null,
  extra: StripeGuestBillingInfo | null,
): StripeGuestBillingInfo | null {
  if (!primary && !extra) return null;
  const email = primary?.email ?? extra?.email;
  if (!email) return null;

  return {
    email,
    name: primary?.name ?? extra?.name ?? null,
    address: mergeGuestAddress(primary?.address ?? null, extra?.address ?? null),
  };
}

/**
 * Guest / Donorbox donor email from expanded charge (billing_details or donorbox_* metadata).
 */
export function extractStripeGuestBillingFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): StripeGuestBillingInfo | null {
  const charge = chargeRecordFromStripeRaw(stripeRaw);
  if (!charge) return null;

  return mergeGuestBilling(
    billingDetailsFromChargeRecord(charge),
    donorboxBillingFromChargeRecord(charge),
  );
}

/**
 * Read a dedicated SKU from expanded charge metadata when Stripe adds it.
 * Does not parse line_items_summary; use sku match rules for bracket codes.
 */
function orderKeyFromMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  return (
    metadataString(metadata.order_key) ?? metadataString(metadata.orderKey)
  );
}

function wcOrderIdFromMetadata(
  metadata: Record<string, unknown> | null,
): number | null {
  if (!metadata) return null;
  const raw =
    metadata.order_id ??
    metadata.orderId ??
    metadata.Order_ID ??
    metadata.OrderId;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      return parsed > 0 ? parsed : null;
    }
  }
  return null;
}

/** WooCommerce order key from charge or payment_intent metadata (`order_key`). */
export function extractOrderKeyFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): string | null {
  if (!stripeRaw) return null;

  const charge = chargeRecordFromStripeRaw(stripeRaw);
  if (charge) {
    const key = orderKeyFromMetadata(asRecord(charge.metadata));
    if (key) return key;
  }

  const source = asRecord(stripeRaw.source);
  if (source?.object === "payment_intent") {
    const key = orderKeyFromMetadata(asRecord(source.metadata));
    if (key) return key;
  }

  return null;
}

/** WooCommerce order id from charge or payment_intent metadata (`order_id`). */
export function extractWcOrderIdFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): number | null {
  if (!stripeRaw) return null;

  const charge = chargeRecordFromStripeRaw(stripeRaw);
  if (charge) {
    const id = wcOrderIdFromMetadata(asRecord(charge.metadata));
    if (id) return id;
  }

  const source = asRecord(stripeRaw.source);
  if (source?.object === "payment_intent") {
    const id = wcOrderIdFromMetadata(asRecord(source.metadata));
    if (id) return id;
  }

  return null;
}

export function extractSkuFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): string | null {
  const charge = chargeRecordFromStripeRaw(stripeRaw) ?? chargeFromRaw(stripeRaw ?? null);
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
