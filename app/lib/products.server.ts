import { asc, count, eq, isNotNull } from "drizzle-orm";
import { getDb } from "~/db";
import {
  productMatchRules,
  products,
  stripeBalanceTransactions,
} from "~/db/schema";

export type ProductRecord = {
  id: string;
  code: string;
  name: string;
  quickbooksItemId: string | null;
  /** VAT rate as a percentage (0–100). */
  vatRatePercent: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** Parse VAT % from form input; empty → 0. */
export function parseVatRatePercent(
  value: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: 0 };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, error: "VAT rate must be between 0 and 100" };
  }
  return { ok: true, value: n };
}

export type ProductMatchRuleRow = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  priority: number;
  field: string;
  matchType: string;
  pattern: string;
  caseInsensitive: boolean;
  isActive: boolean;
};

function productRowToRecord(
  row: typeof products.$inferSelect,
): ProductRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    quickbooksItemId: row.quickbooksItemId,
    vatRatePercent: row.vatRatePercent ?? 0,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProducts(options?: {
  activeOnly?: boolean;
}): Promise<ProductRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .orderBy(asc(products.sortOrder), asc(products.code));

  const filtered = options?.activeOnly
    ? rows.filter((r) => r.isActive)
    : rows;
  return filtered.map(productRowToRecord);
}

export async function getProductById(id: string): Promise<ProductRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ? productRowToRecord(row) : null;
}

export async function createProduct(input: {
  code: string;
  name: string;
  quickbooksItemId?: string | null;
  vatRatePercent?: number;
  sortOrder?: number;
}): Promise<ProductRecord> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(products)
    .values({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      quickbooksItemId: input.quickbooksItemId?.trim() || null,
      vatRatePercent: input.vatRatePercent ?? 0,
      sortOrder: input.sortOrder ?? 0,
      updatedAt: now,
    })
    .returning();
  return productRowToRecord(row!);
}

/** Stripe balance transactions classified to this Lotus product. */
export async function countStripeTransactionsForProduct(
  productId: string,
): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.productId, productId));
  return value;
}

/** Counts per product id (only products with at least one classified transaction). */
export async function countStripeTransactionsPerProduct(): Promise<
  Record<string, number>
> {
  const db = getDb();
  const rows = await db
    .select({
      productId: stripeBalanceTransactions.productId,
      value: count(),
    })
    .from(stripeBalanceTransactions)
    .where(isNotNull(stripeBalanceTransactions.productId))
    .groupBy(stripeBalanceTransactions.productId);

  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.productId) out[row.productId] = row.value;
  }
  return out;
}

export type DeleteProductResult =
  | { ok: true }
  | { ok: false; reason: string; transactionCount: number };

/** Delete a catalog product when no Stripe transactions reference it. */
export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  const transactionCount = await countStripeTransactionsForProduct(id);
  if (transactionCount > 0) {
    return {
      ok: false,
      reason: `Cannot delete: ${transactionCount} Stripe transaction${transactionCount === 1 ? "" : "s"} use this product.`,
      transactionCount,
    };
  }

  const db = getDb();
  const deleted = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id });

  if (deleted.length === 0) {
    return { ok: false, reason: "Product not found", transactionCount: 0 };
  }

  return { ok: true };
}

export async function updateProduct(
  id: string,
  input: Partial<{
    code: string;
    name: string;
    quickbooksItemId: string | null;
    vatRatePercent: number;
    isActive: boolean;
    sortOrder: number;
  }>,
): Promise<ProductRecord | null> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(products)
    .set({
      ...(input.code !== undefined
        ? { code: input.code.trim().toUpperCase() }
        : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.quickbooksItemId !== undefined
        ? { quickbooksItemId: input.quickbooksItemId?.trim() || null }
        : {}),
      ...(input.vatRatePercent !== undefined
        ? { vatRatePercent: input.vatRatePercent }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: now,
    })
    .where(eq(products.id, id))
    .returning();
  return row ? productRowToRecord(row) : null;
}

export async function getProductMatchRuleById(
  id: string,
): Promise<ProductMatchRuleRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: productMatchRules.id,
      productId: productMatchRules.productId,
      productCode: products.code,
      productName: products.name,
      priority: productMatchRules.priority,
      field: productMatchRules.field,
      matchType: productMatchRules.matchType,
      pattern: productMatchRules.pattern,
      caseInsensitive: productMatchRules.caseInsensitive,
      isActive: productMatchRules.isActive,
    })
    .from(productMatchRules)
    .innerJoin(products, eq(productMatchRules.productId, products.id))
    .where(eq(productMatchRules.id, id))
    .limit(1);

  return row ?? null;
}

export async function listProductMatchRules(): Promise<ProductMatchRuleRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: productMatchRules.id,
      productId: productMatchRules.productId,
      productCode: products.code,
      productName: products.name,
      priority: productMatchRules.priority,
      field: productMatchRules.field,
      matchType: productMatchRules.matchType,
      pattern: productMatchRules.pattern,
      caseInsensitive: productMatchRules.caseInsensitive,
      isActive: productMatchRules.isActive,
    })
    .from(productMatchRules)
    .innerJoin(products, eq(productMatchRules.productId, products.id))
    .orderBy(asc(productMatchRules.priority), asc(productMatchRules.id));

  return rows;
}

export async function createProductMatchRule(input: {
  productId: string;
  priority: number;
  field: string;
  matchType: string;
  pattern: string;
  caseInsensitive?: boolean;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(productMatchRules)
    .values({
      productId: input.productId,
      priority: input.priority,
      field: input.field,
      matchType: input.matchType,
      pattern: input.pattern,
      caseInsensitive: input.caseInsensitive ?? true,
    })
    .returning({ id: productMatchRules.id });
  return row!.id;
}

export async function updateProductMatchRule(
  id: string,
  input: Partial<{
    productId: string;
    priority: number;
    field: string;
    matchType: string;
    pattern: string;
    caseInsensitive: boolean;
    isActive: boolean;
  }>,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(productMatchRules)
    .set({
      ...(input.productId !== undefined ? { productId: input.productId } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.field !== undefined ? { field: input.field } : {}),
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.pattern !== undefined ? { pattern: input.pattern } : {}),
      ...(input.caseInsensitive !== undefined
        ? { caseInsensitive: input.caseInsensitive }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: now,
    })
    .where(eq(productMatchRules.id, id));
}

export async function deleteProductMatchRule(id: string): Promise<void> {
  const db = getDb();
  await db.delete(productMatchRules).where(eq(productMatchRules.id, id));
}
