import { and, asc, count, eq, ilike, inArray, isNotNull, max, or } from "drizzle-orm";
import { getDb } from "~/db";
import {
  products,
  woocommerceProducts,
  type WooCommerceOrderLineItem,
} from "~/db/schema";
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

export type WooCommerceProductLotusLink = {
  productId: string;
  code: string;
  name: string;
};

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
  lotusProduct: WooCommerceProductLotusLink | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WooCommerceProductDetail = WooCommerceProductRecord & {
  wcRaw: Record<string, unknown> | null;
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

function lotusLinkFromRow(row: {
  productId: string | null;
  lotusProductCode: string | null;
  lotusProductName: string | null;
}): WooCommerceProductLotusLink | null {
  if (!row.productId || !row.lotusProductCode) return null;
  return {
    productId: row.productId,
    code: row.lotusProductCode,
    name: row.lotusProductName ?? row.lotusProductCode,
  };
}

function rowToRecord(row: {
  product: typeof woocommerceProducts.$inferSelect;
  lotusProductCode: string | null;
  lotusProductName: string | null;
}): WooCommerceProductRecord {
  const p = row.product;
  return {
    id: p.id,
    wcProductId: p.wcProductId,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    status: p.status,
    type: p.type,
    catalogVisibility: p.catalogVisibility,
    permalink: p.permalink,
    shortDescription: p.shortDescription,
    description: p.description,
    currency: p.currency,
    priceMinor: p.priceMinor,
    regularPriceMinor: p.regularPriceMinor,
    salePriceMinor: p.salePriceMinor,
    onSale: p.onSale,
    stockStatus: p.stockStatus,
    stockQuantity: p.stockQuantity,
    categorySummary: p.categorySummary,
    lotusProduct: lotusLinkFromRow({
      productId: p.productId,
      lotusProductCode: row.lotusProductCode,
      lotusProductName: row.lotusProductName,
    }),
    syncedAt: p.syncedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const productListSelect = {
  product: woocommerceProducts,
  lotusProductCode: products.code,
  lotusProductName: products.name,
};

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
  /** When true, only products linked to a Lotus catalog product. */
  mappedOnly?: boolean;
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

  const mappedFilter = options.mappedOnly
    ? isNotNull(woocommerceProducts.productId)
    : undefined;

  const filters = [search, statusFilter, mappedFilter].filter(
    (f): f is NonNullable<typeof f> => f != null,
  );
  const whereClause =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(woocommerceProducts)
    .where(whereClause);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select(productListSelect)
    .from(woocommerceProducts)
    .leftJoin(products, eq(woocommerceProducts.productId, products.id))
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

export async function getWooCommerceProductById(
  id: string,
): Promise<WooCommerceProductDetail | null> {
  const db = getDb();
  const [row] = await db
    .select(productListSelect)
    .from(woocommerceProducts)
    .leftJoin(products, eq(woocommerceProducts.productId, products.id))
    .where(eq(woocommerceProducts.id, id))
    .limit(1);

  if (!row) return null;

  const record = rowToRecord(row);
  return {
    ...record,
    wcRaw: row.product.wcRaw,
  };
}

export async function setWooCommerceProductLotusLink(
  woocommerceProductId: string,
  productId: string | null,
): Promise<WooCommerceProductDetail | null> {
  const db = getDb();
  const now = new Date();

  if (productId) {
    const [catalogProduct] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!catalogProduct) {
      throw new Error("Lotus product not found");
    }
  }

  await db
    .update(woocommerceProducts)
    .set({ productId, updatedAt: now })
    .where(eq(woocommerceProducts.id, woocommerceProductId));

  return getWooCommerceProductById(woocommerceProductId);
}

export type OrderLineSkuStatus = "no_sku" | "wc_deleted" | "wc_unmapped" | "mapped";

export type OrderLineSkuLookup = {
  lineId: number;
  sku: string | null;
  status: OrderLineSkuStatus;
  wcProductInternalId: string | null;
  wcProductName: string | null;
  lotusProduct: {
    catalogProductId: string;
    code: string;
    name: string;
  } | null;
};

type CatalogLookupRow = {
  internalId: string;
  wcProductId: number;
  name: string;
  sku: string | null;
  catalogProductId: string | null;
  catalogCode: string | null;
  catalogName: string | null;
};

const catalogLookupSelect = {
  internalId: woocommerceProducts.id,
  wcProductId: woocommerceProducts.wcProductId,
  name: woocommerceProducts.name,
  sku: woocommerceProducts.sku,
  catalogProductId: products.id,
  catalogCode: products.code,
  catalogName: products.name,
};

function lotusFromCatalogRow(row: CatalogLookupRow) {
  if (!row.catalogProductId || !row.catalogCode) return null;
  return {
    catalogProductId: row.catalogProductId,
    code: row.catalogCode,
    name: row.catalogName ?? row.catalogCode,
  };
}

/** Resolve each order line against synced WC products (by SKU, then WC product id). */
export async function lookupOrderLineItemsInWooCommerceCatalog(
  lineItems: WooCommerceOrderLineItem[],
): Promise<OrderLineSkuLookup[]> {
  const skus = [
    ...new Set(
      lineItems
        .map((line) => line.sku?.trim())
        .filter((sku): sku is string => Boolean(sku)),
    ),
  ];
  const wcProductIds = [
    ...new Set(
      lineItems
        .map((line) => line.productId)
        .filter((id): id is number => id != null && id > 0),
    ),
  ];

  const db = getDb();
  const [bySkuRows, byWcIdRows] = await Promise.all([
    skus.length > 0
      ? db
          .select(catalogLookupSelect)
          .from(woocommerceProducts)
          .leftJoin(products, eq(woocommerceProducts.productId, products.id))
          .where(inArray(woocommerceProducts.sku, skus))
      : Promise.resolve([] as CatalogLookupRow[]),
    wcProductIds.length > 0
      ? db
          .select(catalogLookupSelect)
          .from(woocommerceProducts)
          .leftJoin(products, eq(woocommerceProducts.productId, products.id))
          .where(inArray(woocommerceProducts.wcProductId, wcProductIds))
      : Promise.resolve([] as CatalogLookupRow[]),
  ]);

  const skuMap = new Map<string, CatalogLookupRow>();
  for (const row of bySkuRows) {
    const key = row.sku?.trim();
    if (!key) continue;
    const prev = skuMap.get(key);
    if (!prev || (!prev.catalogProductId && row.catalogProductId)) {
      skuMap.set(key, row);
    }
  }

  const wcIdMap = new Map(byWcIdRows.map((row) => [row.wcProductId, row]));

  return lineItems.map((line) => {
    const sku = line.sku?.trim() || null;
    const catalogRow =
      (sku ? skuMap.get(sku) : undefined) ??
      (line.productId != null && line.productId > 0
        ? wcIdMap.get(line.productId)
        : undefined);

    if (!sku && (line.productId == null || line.productId <= 0)) {
      return {
        lineId: line.id,
        sku: null,
        status: "no_sku" as const,
        wcProductInternalId: null,
        wcProductName: null,
        lotusProduct: null,
      };
    }

    if (!catalogRow) {
      return {
        lineId: line.id,
        sku,
        status: "wc_deleted" as const,
        wcProductInternalId: null,
        wcProductName: null,
        lotusProduct: null,
      };
    }

    const lotusProduct = lotusFromCatalogRow(catalogRow);
    if (!lotusProduct) {
      return {
        lineId: line.id,
        sku,
        status: "wc_unmapped" as const,
        wcProductInternalId: catalogRow.internalId,
        wcProductName: catalogRow.name,
        lotusProduct: null,
      };
    }

    return {
      lineId: line.id,
      sku,
      status: "mapped" as const,
      wcProductInternalId: catalogRow.internalId,
      wcProductName: catalogRow.name,
      lotusProduct,
    };
  });
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
