export type ProductMatchStatus =
  | "matched"
  | "unmatched"
  | "manual"
  | "ambiguous"
  | "woocommerce";

export function formatNewlyMappedStripeTransactions(count: number): string {
  if (count === 0) {
    return "No Stripe transactions were waiting for this product.";
  }
  const label = count === 1 ? "transaction" : "transactions";
  return `Mapped ${count} Stripe ${label} that are not yet in QuickBooks.`;
}

export function stripeProductLockedByQuickBooksPush(
  pushedToQuickbooks: boolean | null,
): boolean {
  return pushedToQuickbooks === true;
}

export const STRIPE_PRODUCT_LOCKED_REASON =
  "This transaction is already in QuickBooks, so its Lotus product stays as it was pushed.";

export function canBulkAssignStripeTransactionProduct(tx: {
  productId: string | null;
  productMatchStatus: ProductMatchStatus | null;
  pushedToQuickbooks?: boolean | null;
}): boolean {
  if (stripeProductLockedByQuickBooksPush(tx.pushedToQuickbooks ?? null)) {
    return false;
  }
  if (tx.productMatchStatus === "manual") return false;
  if (tx.productMatchStatus === "matched" && tx.productId) return false;
  return (
    !tx.productId ||
    tx.productMatchStatus === "unmatched" ||
    tx.productMatchStatus === "ambiguous" ||
    tx.productMatchStatus == null
  );
}
