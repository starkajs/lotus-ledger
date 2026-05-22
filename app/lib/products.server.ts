import { asc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { productMatchRules, products } from "~/db/schema";

export type ProductRecord = {
  id: string;
  code: string;
  name: string;
  quickbooksItemId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

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
      sortOrder: input.sortOrder ?? 0,
      updatedAt: now,
    })
    .returning();
  return productRowToRecord(row!);
}

export async function updateProduct(
  id: string,
  input: Partial<{
    code: string;
    name: string;
    quickbooksItemId: string | null;
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
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: now,
    })
    .where(eq(products.id, id))
    .returning();
  return row ? productRowToRecord(row) : null;
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
