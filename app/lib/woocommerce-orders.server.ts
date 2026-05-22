import { and, asc, count, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { getDb } from "~/db";
import {
  communityMembers,
  products,
  woocommerceOrders,
  woocommerceProducts,
  type WooCommerceOrderLineItem,
} from "~/db/schema";
import {
  billingAddressFromWooCommerce,
  ensureCommunityMemberForEmail,
} from "~/lib/community-members.server";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  type IsoDateString,
} from "~/lib/date-range-filters";
import type { WooCommerceOrder } from "~/lib/woocommerce-api.server";
import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

export { WOOCOMMERCE_ORDER_SYNC_DAYS } from "~/lib/woocommerce-orders.constants";

export const WOOCOMMERCE_ORDERS_PAGE_SIZE = 50;

export type WooCommerceOrderLotusProduct = {
  catalogProductId: string;
  code: string;
  name: string;
  source: "manual" | "line";
};

export type WooCommerceOrderRecord = {
  id: string;
  wcOrderId: number;
  orderNumber: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  subtotalMinor: number | null;
  totalTaxMinor: number | null;
  shippingMinor: number | null;
  discountMinor: number | null;
  dateCreated: string;
  dateModified: string | null;
  datePaid: string | null;
  dateCompleted: string | null;
  paymentMethod: string | null;
  paymentMethodTitle: string | null;
  transactionId: string | null;
  wcCustomerId: number | null;
  billingEmail: string | null;
  billingFirstName: string | null;
  billingLastName: string | null;
  billingCountry: string | null;
  billingCity: string | null;
  billingPostcode: string | null;
  customerNote: string | null;
  lineItems: WooCommerceOrderLineItem[];
  lineSummary: string | null;
  wcRaw: Record<string, unknown> | null;
  communityMemberId: string | null;
  memberEmail: string | null;
  memberName: string | null;
  /** Manual Lotus catalog assignment (persisted). */
  productId: string | null;
  /** Lotus products from manual assignment and/or mapped WC line items. */
  lotusProducts: WooCommerceOrderLotusProduct[];
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertWooCommerceOrderInput = {
  wcOrderId: number;
  orderNumber: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  subtotalMinor: number | null;
  totalTaxMinor: number | null;
  shippingMinor: number | null;
  discountMinor: number | null;
  dateCreated: Date;
  dateModified: Date | null;
  datePaid: Date | null;
  dateCompleted: Date | null;
  paymentMethod: string | null;
  paymentMethodTitle: string | null;
  transactionId: string | null;
  wcCustomerId: number | null;
  billingEmail: string | null;
  billingFirstName: string | null;
  billingLastName: string | null;
  billingCountry: string | null;
  billingCity: string | null;
  billingPostcode: string | null;
  customerNote: string | null;
  lineItems: WooCommerceOrderLineItem[];
  lineSummary: string | null;
  wcRaw: Record<string, unknown>;
  communityMemberId: string | null;
};

function parseWcDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapLineItems(
  order: WooCommerceOrder,
  currency: string,
): WooCommerceOrderLineItem[] {
  return (order.line_items ?? []).map((line) => ({
    id: line.id ?? 0,
    name: line.name?.trim() || "Item",
    sku: line.sku?.trim() || null,
    productId: line.product_id ?? null,
    quantity: line.quantity ?? 0,
    subtotalMinor: parseWooCommerceMoneyMinor(line.subtotal, currency),
    totalMinor: parseWooCommerceMoneyMinor(line.total, currency),
  }));
}

function buildLineSummary(items: WooCommerceOrderLineItem[]): string | null {
  if (items.length === 0) return null;
  const parts = items.slice(0, 4).map((item) => {
    const qty = item.quantity > 1 ? `${item.quantity}× ` : "";
    const sku = item.sku ? ` [${item.sku}]` : "";
    return `${qty}${item.name}${sku}`;
  });
  const suffix = items.length > 4 ? ` (+${items.length - 4} more)` : "";
  return parts.join(", ") + suffix;
}

function billingName(billing: WooCommerceOrder["billing"]): string | null {
  if (!billing) return null;
  const parts = [billing.first_name, billing.last_name]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function mapWooCommerceOrder(
  order: WooCommerceOrder,
  member: { communityMemberId: string | null },
): UpsertWooCommerceOrderInput {
  const currency = (order.currency || "gbp").toLowerCase();
  const lineItems = mapLineItems(order, currency);
  const billing = order.billing;
  const wcRaw = JSON.parse(JSON.stringify(order)) as Record<string, unknown>;

  return {
    wcOrderId: order.id,
    orderNumber: order.number?.trim() || String(order.id),
    status: order.status,
    currency,
    totalMinor: parseWooCommerceMoneyMinor(order.total, currency) ?? 0,
    subtotalMinor: parseWooCommerceMoneyMinor(order.subtotal, currency),
    totalTaxMinor: parseWooCommerceMoneyMinor(order.total_tax, currency),
    shippingMinor: parseWooCommerceMoneyMinor(order.shipping_total, currency),
    discountMinor: parseWooCommerceMoneyMinor(order.discount_total, currency),
    dateCreated: parseWcDate(order.date_created) ?? new Date(),
    dateModified: parseWcDate(order.date_modified),
    datePaid: parseWcDate(order.date_paid ?? undefined),
    dateCompleted: parseWcDate(order.date_completed ?? undefined),
    paymentMethod: order.payment_method?.trim() || null,
    paymentMethodTitle: order.payment_method_title?.trim() || null,
    transactionId: order.transaction_id?.trim() || null,
    wcCustomerId:
      order.customer_id !== undefined && order.customer_id > 0
        ? order.customer_id
        : null,
    billingEmail: billing?.email?.trim().toLowerCase() || null,
    billingFirstName: billing?.first_name?.trim() || null,
    billingLastName: billing?.last_name?.trim() || null,
    billingCountry: billing?.country?.trim().toUpperCase() || null,
    billingCity: billing?.city?.trim() || null,
    billingPostcode: billing?.postcode?.trim() || null,
    customerNote: order.customer_note?.trim() || null,
    lineItems,
    lineSummary: buildLineSummary(lineItems),
    wcRaw,
    communityMemberId: member.communityMemberId,
  };
}

function rowToRecord(
  row: typeof woocommerceOrders.$inferSelect,
  member?: { email: string | null; name: string | null } | null,
): WooCommerceOrderRecord {
  return {
    id: row.id,
    wcOrderId: row.wcOrderId,
    orderNumber: row.orderNumber,
    status: row.status,
    currency: row.currency,
    totalMinor: row.totalMinor,
    subtotalMinor: row.subtotalMinor,
    totalTaxMinor: row.totalTaxMinor,
    shippingMinor: row.shippingMinor,
    discountMinor: row.discountMinor,
    dateCreated: row.dateCreated.toISOString(),
    dateModified: row.dateModified?.toISOString() ?? null,
    datePaid: row.datePaid?.toISOString() ?? null,
    dateCompleted: row.dateCompleted?.toISOString() ?? null,
    paymentMethod: row.paymentMethod,
    paymentMethodTitle: row.paymentMethodTitle,
    transactionId: row.transactionId,
    wcCustomerId: row.wcCustomerId,
    billingEmail: row.billingEmail,
    billingFirstName: row.billingFirstName,
    billingLastName: row.billingLastName,
    billingCountry: row.billingCountry,
    billingCity: row.billingCity,
    billingPostcode: row.billingPostcode,
    customerNote: row.customerNote,
    lineItems: row.lineItems ?? [],
    lineSummary: row.lineSummary,
    wcRaw: row.wcRaw ?? null,
    communityMemberId: row.communityMemberId,
    memberEmail: member?.email ?? row.billingEmail,
    memberName: member?.name ?? null,
    productId: row.productId,
    lotusProducts: [],
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertWooCommerceOrder(
  input: UpsertWooCommerceOrderInput,
): Promise<"created" | "updated"> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({ id: woocommerceOrders.id })
    .from(woocommerceOrders)
    .where(eq(woocommerceOrders.wcOrderId, input.wcOrderId))
    .limit(1);

  const values = {
    orderNumber: input.orderNumber,
    status: input.status,
    currency: input.currency,
    totalMinor: input.totalMinor,
    subtotalMinor: input.subtotalMinor,
    totalTaxMinor: input.totalTaxMinor,
    shippingMinor: input.shippingMinor,
    discountMinor: input.discountMinor,
    dateCreated: input.dateCreated,
    dateModified: input.dateModified,
    datePaid: input.datePaid,
    dateCompleted: input.dateCompleted,
    paymentMethod: input.paymentMethod,
    paymentMethodTitle: input.paymentMethodTitle,
    transactionId: input.transactionId,
    wcCustomerId: input.wcCustomerId,
    billingEmail: input.billingEmail,
    billingFirstName: input.billingFirstName,
    billingLastName: input.billingLastName,
    billingCountry: input.billingCountry,
    billingCity: input.billingCity,
    billingPostcode: input.billingPostcode,
    customerNote: input.customerNote,
    lineItems: input.lineItems,
    lineSummary: input.lineSummary,
    wcRaw: input.wcRaw,
    communityMemberId: input.communityMemberId,
    syncedAt: now,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(woocommerceOrders)
      .set(values)
      .where(eq(woocommerceOrders.id, existing.id));
    return "updated";
  }

  await db.insert(woocommerceOrders).values({
    wcOrderId: input.wcOrderId,
    ...values,
  });
  return "created";
}

export async function linkWooCommerceOrderToMember(
  order: WooCommerceOrder,
): Promise<{ communityMemberId: string | null; membersLinked: number }> {
  const email = order.billing?.email?.trim();
  if (!email) {
    return { communityMemberId: null, membersLinked: 0 };
  }

  const member = await ensureCommunityMemberForEmail({
    email,
    name: billingName(order.billing),
    address: order.billing
      ? billingAddressFromWooCommerce(order.billing)
      : null,
    joinedAt: parseWcDate(order.date_created) ?? undefined,
  });

  return {
    communityMemberId: member.communityMemberId,
    membersLinked: member.communityMemberId ? 1 : 0,
  };
}

export type ListWooCommerceOrdersOptions = {
  status?: string;
  dateFrom?: IsoDateString | null;
  dateTo?: IsoDateString | null;
  /** Only orders with no line item linked to a Lotus catalog product. */
  lotusProductMissing?: boolean;
  page?: number;
  pageSize?: number;
};

/** Order has ≥1 line whose WC product is mapped to a Lotus catalog product. */
const orderHasMappedLotusProduct = sql`exists (
  select 1
  from jsonb_array_elements(coalesce(${woocommerceOrders.lineItems}, '[]'::jsonb)) as line(elem)
  inner join ${woocommerceProducts} wp
    on wp.wc_product_id = (line.elem->>'productId')::int
  where wp.product_id is not null
    and coalesce((line.elem->>'productId')::int, 0) > 0
)`;

function buildWooCommerceOrdersWhere(options: ListWooCommerceOrdersOptions) {
  const filters = [];

  if (options.status && options.status !== "all") {
    filters.push(eq(woocommerceOrders.status, options.status));
  }

  if (options.dateFrom) {
    filters.push(
      calendarDateCreatedGte(woocommerceOrders.dateCreated, options.dateFrom),
    );
  }
  if (options.dateTo) {
    filters.push(
      calendarDateCreatedLte(woocommerceOrders.dateCreated, options.dateTo),
    );
  }

  if (options.lotusProductMissing) {
    filters.push(
      sql`not (${orderHasMappedLotusProduct} or ${woocommerceOrders.productId} is not null)`,
    );
  }

  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
}

export type ListWooCommerceOrdersDbResult = {
  configured: boolean;
  siteUrl: string | null;
  orders: WooCommerceOrderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  lastSyncedAt: string | null;
};

async function attachLotusProductsToOrders(
  orders: WooCommerceOrderRecord[],
): Promise<WooCommerceOrderRecord[]> {
  const wcProductIds = new Set<number>();
  const manualProductIds = new Set<string>();
  for (const order of orders) {
    if (order.productId) manualProductIds.add(order.productId);
    for (const line of order.lineItems) {
      if (line.productId != null && line.productId > 0) {
        wcProductIds.add(line.productId);
      }
    }
  }

  if (wcProductIds.size === 0 && manualProductIds.size === 0) {
    return orders;
  }

  const db = getDb();
  const [mappings, manualRows] = await Promise.all([
    wcProductIds.size > 0
      ? db
          .select({
            wcProductId: woocommerceProducts.wcProductId,
            catalogProductId: products.id,
            code: products.code,
            name: products.name,
          })
          .from(woocommerceProducts)
          .innerJoin(products, eq(woocommerceProducts.productId, products.id))
          .where(inArray(woocommerceProducts.wcProductId, [...wcProductIds]))
      : Promise.resolve([]),
    manualProductIds.size > 0
      ? db
          .select({
            id: products.id,
            code: products.code,
            name: products.name,
          })
          .from(products)
          .where(inArray(products.id, [...manualProductIds]))
      : Promise.resolve([]),
  ]);

  const byWcProductId = new Map(
    mappings.map((m) => [m.wcProductId, m]),
  );
  const byCatalogId = new Map(
    manualRows.map((p) => [p.id, p]),
  );

  return orders.map((order) => {
    const seen = new Set<string>();
    const lotusProducts: WooCommerceOrderLotusProduct[] = [];

    if (order.productId) {
      const manual = byCatalogId.get(order.productId);
      if (manual) {
        seen.add(manual.id);
        lotusProducts.push({
          catalogProductId: manual.id,
          code: manual.code,
          name: manual.name,
          source: "manual",
        });
      }
    }

    for (const line of order.lineItems) {
      if (line.productId == null || line.productId <= 0) continue;
      const link = byWcProductId.get(line.productId);
      if (!link || seen.has(link.catalogProductId)) continue;
      seen.add(link.catalogProductId);
      lotusProducts.push({
        catalogProductId: link.catalogProductId,
        code: link.code,
        name: link.name,
        source: "line",
      });
    }
    return { ...order, lotusProducts };
  });
}

export async function listWooCommerceOrdersFromDb(
  options: ListWooCommerceOrdersOptions = {},
): Promise<ListWooCommerceOrdersDbResult> {
  const { isWooCommerceConfigured, getWooCommerceSiteUrl } = await import(
    "~/lib/env.server"
  );
  const pageSize = options.pageSize ?? WOOCOMMERCE_ORDERS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const db = getDb();

  const whereClause = buildWooCommerceOrdersWhere(options);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(woocommerceOrders)
    .where(whereClause);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select({
      order: woocommerceOrders,
      memberEmail: communityMembers.email,
      memberName: communityMembers.name,
    })
    .from(woocommerceOrders)
    .leftJoin(
      communityMembers,
      eq(woocommerceOrders.communityMemberId, communityMembers.id),
    )
    .where(whereClause)
    .orderBy(desc(woocommerceOrders.dateCreated))
    .limit(pageSize)
    .offset(offset);

  const [{ lastSyncedAt }] = await db
    .select({ lastSyncedAt: max(woocommerceOrders.syncedAt) })
    .from(woocommerceOrders);

  const orders = await attachLotusProductsToOrders(
    rows.map((row) =>
      rowToRecord(row.order, {
        email: row.memberEmail,
        name: row.memberName,
      }),
    ),
  );

  return {
    configured: isWooCommerceConfigured(),
    siteUrl: getWooCommerceSiteUrl() ?? null,
    orders,
    total,
    page: safePage,
    pageSize,
    totalPages,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
  };
}

export async function getWooCommerceOrderById(
  id: string,
): Promise<WooCommerceOrderRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      order: woocommerceOrders,
      memberEmail: communityMembers.email,
      memberName: communityMembers.name,
    })
    .from(woocommerceOrders)
    .leftJoin(
      communityMembers,
      eq(woocommerceOrders.communityMemberId, communityMembers.id),
    )
    .where(eq(woocommerceOrders.id, id))
    .limit(1);

  if (!row) return null;
  const [order] = await attachLotusProductsToOrders([
    rowToRecord(row.order, {
      email: row.memberEmail,
      name: row.memberName,
    }),
  ]);
  return order ?? null;
}

export async function setWooCommerceOrderLotusProduct(
  orderId: string,
  productId: string | null,
): Promise<WooCommerceOrderRecord | null> {
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
    .update(woocommerceOrders)
    .set({ productId, updatedAt: now })
    .where(eq(woocommerceOrders.id, orderId));

  return getWooCommerceOrderById(orderId);
}

const UNMAPPED_LOTUS_KEY = "__unmapped__";

export type WooCommerceOrderLineProductAggregate = {
  wcProductId: number | null;
  name: string;
  sku: string | null;
  currency: string;
  amountMinor: number;
  quantity: number;
};

export type WooCommerceLotusProductAggregate = {
  catalogProductId: string | null;
  code: string | null;
  name: string;
  unmapped: boolean;
  lines: WooCommerceOrderLineProductAggregate[];
  subtotals: { currency: string; amountMinor: number }[];
};

export type WooCommerceOrdersByProductResult = {
  configured: boolean;
  siteUrl: string | null;
  orderCount: number;
  groups: WooCommerceLotusProductAggregate[];
  grandTotals: { currency: string; amountMinor: number }[];
};

function lineProductKey(line: WooCommerceOrderLineItem): string {
  return `${line.productId ?? 0}\0${line.sku ?? ""}\0${line.name}`;
}

function lineAmountMinor(line: WooCommerceOrderLineItem): number {
  return line.totalMinor ?? line.subtotalMinor ?? 0;
}

type LotusBucket = {
  catalogProductId: string | null;
  code: string | null;
  name: string;
  unmapped: boolean;
  lines: Map<
    string,
    {
      wcProductId: number | null;
      name: string;
      sku: string | null;
      byCurrency: Map<string, { amountMinor: number; quantity: number }>;
    }
  >;
};

export async function aggregateWooCommerceOrdersByLotusAndLine(
  options: Omit<ListWooCommerceOrdersOptions, "page" | "pageSize"> = {},
): Promise<WooCommerceOrdersByProductResult> {
  const { isWooCommerceConfigured, getWooCommerceSiteUrl } = await import(
    "~/lib/env.server"
  );
  const db = getDb();
  const whereClause = buildWooCommerceOrdersWhere(options);

  const orderRows = await db
    .select({
      currency: woocommerceOrders.currency,
      lineItems: woocommerceOrders.lineItems,
      productId: woocommerceOrders.productId,
      totalMinor: woocommerceOrders.totalMinor,
    })
    .from(woocommerceOrders)
    .where(whereClause);

  const manualProductIds = [
    ...new Set(
      orderRows
        .map((row) => row.productId)
        .filter((id): id is string => id != null),
    ),
  ];

  const [mappings, manualCatalogRows] = await Promise.all([
    db
      .select({
        wcProductId: woocommerceProducts.wcProductId,
        catalogProductId: products.id,
        code: products.code,
        name: products.name,
      })
      .from(woocommerceProducts)
      .innerJoin(products, eq(woocommerceProducts.productId, products.id))
      .where(isNotNull(woocommerceProducts.productId)),
    manualProductIds.length > 0
      ? db
          .select({
            id: products.id,
            code: products.code,
            name: products.name,
          })
          .from(products)
          .where(inArray(products.id, manualProductIds))
      : Promise.resolve([]),
  ]);

  const lotusByWcProductId = new Map(
    mappings.map((m) => [m.wcProductId, m]),
  );
  const lotusByCatalogId = new Map(
    manualCatalogRows.map((p) => [p.id, p]),
  );

  const buckets = new Map<string, LotusBucket>();

  function ensureLotusBucket(key: string, lotus: {
    catalogProductId: string | null;
    code: string | null;
    name: string;
    unmapped: boolean;
  }): LotusBucket {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        catalogProductId: lotus.catalogProductId,
        code: lotus.code,
        name: lotus.name,
        unmapped: lotus.unmapped,
        lines: new Map(),
      };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const order of orderRows) {
    const currency = order.currency;
    const manualLotus = order.productId
      ? lotusByCatalogId.get(order.productId)
      : undefined;
    const lines = order.lineItems ?? [];

    if (lines.length === 0) {
      if (!manualLotus) continue;
      const lotus = {
        key: manualLotus.id,
        catalogProductId: manualLotus.id,
        code: manualLotus.code,
        name: manualLotus.name,
        unmapped: false,
      };
      const bucket = ensureLotusBucket(lotus.key, lotus);
      const lineKey = "__order_total__";
      let lineBucket = bucket.lines.get(lineKey);
      if (!lineBucket) {
        lineBucket = {
          wcProductId: null,
          name: "(order total)",
          sku: null,
          byCurrency: new Map(),
        };
        bucket.lines.set(lineKey, lineBucket);
      }
      const existing = lineBucket.byCurrency.get(currency) ?? {
        amountMinor: 0,
        quantity: 0,
      };
      lineBucket.byCurrency.set(currency, {
        amountMinor: existing.amountMinor + order.totalMinor,
        quantity: existing.quantity + 1,
      });
      continue;
    }

    for (const line of lines) {
      const wcLink =
        line.productId != null && line.productId > 0
          ? lotusByWcProductId.get(line.productId)
          : undefined;

      const lotus = wcLink
        ? {
            key: wcLink.catalogProductId,
            catalogProductId: wcLink.catalogProductId,
            code: wcLink.code,
            name: wcLink.name,
            unmapped: false,
          }
        : manualLotus
          ? {
              key: manualLotus.id,
              catalogProductId: manualLotus.id,
              code: manualLotus.code,
              name: manualLotus.name,
              unmapped: false,
            }
          : {
              key: UNMAPPED_LOTUS_KEY,
              catalogProductId: null,
              code: null,
              name: "Unmapped",
              unmapped: true,
            };

      const bucket = ensureLotusBucket(lotus.key, lotus);
      const lineKey = lineProductKey(line);
      let lineBucket = bucket.lines.get(lineKey);
      if (!lineBucket) {
        lineBucket = {
          wcProductId: line.productId,
          name: line.name,
          sku: line.sku,
          byCurrency: new Map(),
        };
        bucket.lines.set(lineKey, lineBucket);
      }

      const amount = lineAmountMinor(line);
      const existing = lineBucket.byCurrency.get(currency) ?? {
        amountMinor: 0,
        quantity: 0,
      };
      lineBucket.byCurrency.set(currency, {
        amountMinor: existing.amountMinor + amount,
        quantity: existing.quantity + line.quantity,
      });
    }
  }

  const grandByCurrency = new Map<string, number>();

  const groups: WooCommerceLotusProductAggregate[] = [...buckets.values()]
    .map((bucket) => {
      const lines: WooCommerceOrderLineProductAggregate[] = [];
      const subByCurrency = new Map<string, number>();

      for (const lineBucket of bucket.lines.values()) {
        for (const [cur, totals] of lineBucket.byCurrency) {
          lines.push({
            wcProductId: lineBucket.wcProductId,
            name: lineBucket.name,
            sku: lineBucket.sku,
            currency: cur,
            amountMinor: totals.amountMinor,
            quantity: totals.quantity,
          });
          subByCurrency.set(
            cur,
            (subByCurrency.get(cur) ?? 0) + totals.amountMinor,
          );
          grandByCurrency.set(
            cur,
            (grandByCurrency.get(cur) ?? 0) + totals.amountMinor,
          );
        }
      }

      lines.sort((a, b) => {
        const name = a.name.localeCompare(b.name);
        if (name !== 0) return name;
        return (a.sku ?? "").localeCompare(b.sku ?? "");
      });

      const subtotals = [...subByCurrency.entries()]
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

      return {
        catalogProductId: bucket.catalogProductId,
        code: bucket.code,
        name: bucket.name,
        unmapped: bucket.unmapped,
        lines,
        subtotals,
      };
    })
    .sort((a, b) => {
      if (a.unmapped !== b.unmapped) return a.unmapped ? 1 : -1;
      return (a.code ?? a.name).localeCompare(b.code ?? b.name);
    });

  const grandTotals = [...grandByCurrency.entries()]
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    configured: isWooCommerceConfigured(),
    siteUrl: getWooCommerceSiteUrl() ?? null,
    orderCount: orderRows.length,
    groups,
    grandTotals,
  };
}

export async function listDistinctWooCommerceOrderStatuses(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ status: woocommerceOrders.status })
    .from(woocommerceOrders)
    .orderBy(asc(woocommerceOrders.status));
  return rows.map((r) => r.status);
}

export async function countWooCommerceOrders(): Promise<number> {
  const db = getDb();
  const [{ value }] = await db.select({ value: count() }).from(woocommerceOrders);
  return value;
}

export async function countWooCommerceOrdersForMember(
  communityMemberId: string,
): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(woocommerceOrders)
    .where(eq(woocommerceOrders.communityMemberId, communityMemberId));
  return value;
}

export type ListWooCommerceOrdersForMemberResult = {
  orders: WooCommerceOrderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listWooCommerceOrdersForMember(options: {
  communityMemberId: string;
  page?: number;
  pageSize?: number;
}): Promise<ListWooCommerceOrdersForMemberResult> {
  const pageSize = options.pageSize ?? WOOCOMMERCE_ORDERS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = eq(woocommerceOrders.communityMemberId, options.communityMemberId);
  const db = getDb();

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(woocommerceOrders)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select()
    .from(woocommerceOrders)
    .where(where)
    .orderBy(desc(woocommerceOrders.dateCreated))
    .limit(pageSize)
    .offset(offset);

  return {
    orders: rows.map((row) => rowToRecord(row)),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}
