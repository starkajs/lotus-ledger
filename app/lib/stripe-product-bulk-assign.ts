export type ProductMatchStatus =
  | "matched"
  | "unmatched"
  | "manual"
  | "ambiguous";

export function canBulkAssignStripeTransactionProduct(tx: {
  productId: string | null;
  productMatchStatus: ProductMatchStatus | null;
}): boolean {
  if (tx.productMatchStatus === "manual") return false;
  if (tx.productMatchStatus === "matched" && tx.productId) return false;
  return (
    !tx.productId ||
    tx.productMatchStatus === "unmatched" ||
    tx.productMatchStatus === "ambiguous" ||
    tx.productMatchStatus == null
  );
}
