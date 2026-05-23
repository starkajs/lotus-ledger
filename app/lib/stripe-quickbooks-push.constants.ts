/** Client-safe enums for Stripe → QuickBooks Sales Receipt push rules. */

export const STRIPE_QB_PUSH_RULE_FIELDS = [
  "any",
  "sku",
  "balance_description",
  "charge_description",
  "line_item_1",
  "line_items_summary",
  "donorbox_metadata",
  "metadata_all",
  "stripe_type",
  "reporting_category",
] as const;

export type StripeQuickBooksPushRuleField =
  (typeof STRIPE_QB_PUSH_RULE_FIELDS)[number];

export const STRIPE_QB_PUSH_MATCH_TYPES = ["contains", "regex"] as const;

export type StripeQuickBooksPushMatchType =
  (typeof STRIPE_QB_PUSH_MATCH_TYPES)[number];

/** Line amount on the Sales Receipt (Stripe stores minor units). */
export const STRIPE_QB_AMOUNT_SOURCES = ["net", "gross"] as const;

export type StripeQuickBooksAmountSource =
  (typeof STRIPE_QB_AMOUNT_SOURCES)[number];

export const STRIPE_QB_CUSTOMER_MODES = [
  "omit",
  "bill_email",
  "fixed",
] as const;

export type StripeQuickBooksCustomerMode =
  (typeof STRIPE_QB_CUSTOMER_MODES)[number];

export const STRIPE_QB_PUSH_RULE_FIELD_LABELS: Record<
  StripeQuickBooksPushRuleField,
  string
> = {
  any: "Any classification field",
  sku: "SKU",
  balance_description: "Balance description",
  charge_description: "Charge description",
  line_item_1: "Line item 1",
  line_items_summary: "Line items summary",
  donorbox_metadata: "Donorbox metadata",
  metadata_all: "All metadata",
  stripe_type: "Stripe balance txn type",
  reporting_category: "Stripe reporting category",
};
