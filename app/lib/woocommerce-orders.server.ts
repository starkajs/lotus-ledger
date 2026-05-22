import { asc, count, desc, eq, max } from "drizzle-orm";
import { getDb } from "~/db";
import {
  communityMembers,
  woocommerceOrders,
  type WooCommerceOrderLineItem,
} from "~/db/schema";
import {
  billingAddressFromWooCommerce,
  ensureCommunityMemberForEmail,
} from "~/lib/community-members.server";
import type { WooCommerceOrder } from "~/lib/woocommerce-api.server";
import { parseWooCommerceMoneyMinor } from "~/lib/woocommerce-money";

export const WOOCOMMERCE_ORDERS_PAGE_SIZE = 50;

export const WOOCOMMERCE_ORDER_SYNC_DAYS = 90;

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
    return `${qty}${item.name}`;
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
  page?: number;
  pageSize?: number;
};

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

export async function listWooCommerceOrdersFromDb(
  options: ListWooCommerceOrdersOptions = {},
): Promise<ListWooCommerceOrdersDbResult> {
  const { isWooCommerceConfigured, getWooCommerceSiteUrl } = await import(
    "~/lib/env.server"
  );
  const pageSize = options.pageSize ?? WOOCOMMERCE_ORDERS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const db = getDb();

  const statusFilter =
    options.status && options.status !== "all"
      ? eq(woocommerceOrders.status, options.status)
      : undefined;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(woocommerceOrders)
    .where(statusFilter);

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
    .where(statusFilter)
    .orderBy(desc(woocommerceOrders.dateCreated))
    .limit(pageSize)
    .offset(offset);

  const [{ lastSyncedAt }] = await db
    .select({ lastSyncedAt: max(woocommerceOrders.syncedAt) })
    .from(woocommerceOrders);

  return {
    configured: isWooCommerceConfigured(),
    siteUrl: getWooCommerceSiteUrl() ?? null,
    orders: rows.map((row) =>
      rowToRecord(row.order, {
        email: row.memberEmail,
        name: row.memberName,
      }),
    ),
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
  return rowToRecord(row.order, {
    email: row.memberEmail,
    name: row.memberName,
  });
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
