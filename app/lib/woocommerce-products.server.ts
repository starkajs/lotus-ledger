import { and, asc, count, eq, ilike, max, or } from "drizzle-orm";
import { getDb } from "~/db";
import { woocommerceProducts } from "~/db/schema";
import { getWooCommerceStoreCurrency } from "~/lib/env.server";
import type { WooCommerceProduct } from "~/lib/woocommerce-api.server";
import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

export const WOOCOMMERCE_PRODUCTS_PAGE_SIZE = 50;

function stripHtml(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function buildCategorySummary(
  categories: WooCommerceProduct["categories"],
): string | null {
  if (!categories?.length) return null;
  const names = categories
    .map((c) => c.name?.trim())
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : null;
}

export type WooCommerceProductRecord = {
  id: string;
  wcProductId: number;
  name: string;
  slug: string | null;
  sku: string | null;
  status: string;
  type: string;
  catalogVisibility: string | null;
  permalink: string | null;
  shortDescription: string | null;
  description: string | null;
  currency: string;
  priceMinor: number | null;
  regularPriceMinor: number | null;
  salePriceMinor: number | null;
  onSale: boolean;
  stockStatus: string | null;
  stockQuantity: number | null;
  categorySummary: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function mapWooCommerceProduct(
  product: WooCommerceProduct,
  currency: string,
): Omit<
  typeof woocommerceProducts.$inferInsert,
  "id" | "syncedAt" | "createdAt" | "updatedAt"
> {
  const cur = currency.toLowerCase();
  return {
    wcProductId: product.id,
    name: product.name?.trim() || `Product ${product.id}`,
    slug: product.slug?.trim() || null,
    sku: product.sku?.trim() || null,
    status: product.status,
    type: product.type,
    catalogVisibility: product.catalog_visibility?.trim() || null,
    permalink: product.permalink?.trim() || null,
    shortDescription: stripHtml(product.short_description),
    description: stripHtml(product.description),
    currency: cur,
    priceMinor: parseWooCommerceMoneyMinor(product.price, cur),
    regularPriceMinor: parseWooCommerceMoneyMinor(product.regular_price, cur),
    salePriceMinor: parseWooCommerceMoneyMinor(product.sale_price, cur),
    onSale: product.on_sale === true,
    stockStatus: product.stock_status?.trim() || null,
    stockQuantity:
      product.stock_quantity === null || product.stock_quantity === undefined
        ? null
        : Math.trunc(product.stock_quantity),
    categorySummary: buildCategorySummary(product.categories),
    wcRaw: JSON.parse(JSON.stringify(product)) as Record<string, unknown>,
  };
}

function rowToRecord(
  row: typeof woocommerceProducts.$inferSelect,
): WooCommerceProductRecord {
  return {
    id: row.id,
    wcProductId: row.wcProductId,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    status: row.status,
    type: row.type,
    catalogVisibility: row.catalogVisibility,
    permalink: row.permalink,
    shortDescription: row.shortDescription,
    description: row.description,
    currency: row.currency,
    priceMinor: row.priceMinor,
    regularPriceMinor: row.regularPriceMinor,
    salePriceMinor: row.salePriceMinor,
    onSale: row.onSale,
    stockStatus: row.stockStatus,
    stockQuantity: row.stockQuantity,
    categorySummary: row.categorySummary,
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertWooCommerceProduct(
  input: Omit<
    typeof woocommerceProducts.$inferInsert,
    "id" | "syncedAt" | "createdAt" | "updatedAt"
  >,
): Promise<"created" | "updated"> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({ id: woocommerceProducts.id })
    .from(woocommerceProducts)
    .where(eq(woocommerceProducts.wcProductId, input.wcProductId))
    .limit(1);

  const values = {
    ...input,
    syncedAt: now,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(woocommerceProducts)
      .set(values)
      .where(eq(woocommerceProducts.id, existing.id));
    return "updated";
  }

  await db.insert(woocommerceProducts).values(values);
  return "created";
}

export type ListWooCommerceProductsDbOptions = {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type ListWooCommerceProductsDbResult = {
  configured: boolean;
  siteUrl: string | null;
  products: WooCommerceProductRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  lastSyncedAt: string | null;
};

export async function listWooCommerceProductsFromDb(
  options: ListWooCommerceProductsDbOptions = {},
): Promise<ListWooCommerceProductsDbResult> {
  const { isWooCommerceConfigured, getWooCommerceSiteUrl } = await import(
    "~/lib/env.server"
  );
  const pageSize = options.pageSize ?? WOOCOMMERCE_PRODUCTS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const db = getDb();

  const q = options.q?.trim();
  const search = q
    ? or(
        ilike(woocommerceProducts.name, `%${q}%`),
        ilike(woocommerceProducts.sku, `%${q}%`),
        ilike(woocommerceProducts.slug, `%${q}%`),
      )
    : undefined;

  const statusFilter =
    options.status && options.status !== "all"
      ? eq(woocommerceProducts.status, options.status)
      : undefined;

  const whereClause =
    search && statusFilter
      ? and(search, statusFilter)
      : search ?? statusFilter;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(woocommerceProducts)
    .where(whereClause);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select()
    .from(woocommerceProducts)
    .where(whereClause)
    .orderBy(asc(woocommerceProducts.name))
    .limit(pageSize)
    .offset(offset);

  const [{ lastSyncedAt }] = await db
    .select({ lastSyncedAt: max(woocommerceProducts.syncedAt) })
    .from(woocommerceProducts);

  return {
    configured: isWooCommerceConfigured(),
    siteUrl: getWooCommerceSiteUrl() ?? null,
    products: rows.map(rowToRecord),
    total,
    page: safePage,
    pageSize,
    totalPages,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
  };
}

export async function listDistinctWooCommerceProductStatuses(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ status: woocommerceProducts.status })
    .from(woocommerceProducts)
    .orderBy(asc(woocommerceProducts.status));
  return rows.map((r) => r.status);
}

export async function countWooCommerceProducts(): Promise<number> {
  const db = getDb();
  const [{ value }] = await db.select({ value: count() }).from(woocommerceProducts);
  return value;
}

export async function syncWooCommerceProductsFromApi(): Promise<{
  created: number;
  updated: number;
}> {
  const { iterateWooCommerceProducts } = await import(
    "~/lib/woocommerce-api.server"
  );
  const currency = getWooCommerceStoreCurrency();
  let created = 0;
  let updated = 0;
  let processed = 0;

  for await (const product of iterateWooCommerceProducts({ status: "any" })) {
    processed += 1;
    if (processed % 100 === 0) {
      console.log(`  … ${processed} WooCommerce products processed`);
    }
    const status = await upsertWooCommerceProduct(
      mapWooCommerceProduct(product, currency),
    );
    if (status === "created") created += 1;
    else updated += 1;
  }

  return { created, updated };
}
