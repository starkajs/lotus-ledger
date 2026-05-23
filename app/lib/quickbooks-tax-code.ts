/** Client-safe helpers for QuickBooks TaxCode / VAT refs. */

export function quickbooksRefId(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null;
  const value = (ref as { value?: unknown }).value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function quickbooksRefName(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null;
  const name = (ref as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * Sales / purchase tax code on a synced QuickBooks Item (`SalesTaxCodeRef` in UK/EU).
 * Used as `TaxCodeRef` on Sales Receipt line detail when pushing Stripe charges.
 */
export function extractSalesTaxCodeRefFromItemRaw(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) return null;
  return (
    quickbooksRefId(raw.SalesTaxCodeRef) ??
    quickbooksRefId(raw.PurchaseTaxCodeRef) ??
    quickbooksRefId(raw.TaxCodeRef) ??
    null
  );
}

export function extractClassRefFromItemRaw(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) return null;
  return quickbooksRefId(raw.ClassRef);
}

export type QuickBooksPushTaxCodeSource = "product" | "item";

export function resolveStripeQuickBooksPushTaxCode(input: {
  /** Lotus product `quickbooks_tax_code_id` (preferred). */
  productTaxCodeId: string | null;
  /** Fallback from synced QB item when product has no code. */
  itemSalesTaxCodeId: string | null;
}): {
  taxCodeId: string | null;
  source: QuickBooksPushTaxCodeSource | null;
} {
  if (input.productTaxCodeId?.trim()) {
    return {
      taxCodeId: input.productTaxCodeId.trim(),
      source: "product",
    };
  }
  if (input.itemSalesTaxCodeId?.trim()) {
    return {
      taxCodeId: input.itemSalesTaxCodeId.trim(),
      source: "item",
    };
  }
  return { taxCodeId: null, source: null };
}
