import type Stripe from "stripe";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { getDb } from "~/db";
import { stripeTransactionMatchesWooCommerceOrder } from "~/lib/wc-stripe-order-link";
import {
  communityMembers,
  products,
  stripeBalanceTransactions,
  stripeConnections,
  woocommerceOrders,
} from "~/db/schema";
import type { ProductMatchStatus } from "./product-classification.server";
import { initialPushedToQuickbooks } from "./stripe-quickbooks.constants";
import { ensureCommunityMemberForEmail } from "./community-members.server";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  type IsoDateString,
} from "./date-range-filters";
import {
  extractPaymentIntentIdFromStripeRaw,
  extractSkuFromStripeRaw,
  extractStripeGuestBillingFromStripeRaw,
  extractOrderKeyFromStripeRaw,
  extractWcOrderIdFromStripeRaw,
  extractStripeTransactionProductSignals,
} from "./stripe-transaction-signals";

export const STRIPE_TRANSACTIONS_PAGE_SIZE = 50;

export type StripeBalanceTransactionRecord = {
  id: string;
  stripeConnectionId: string;
  stripeBalanceTransactionId: string;
  amount: number;
  currency: string;
  net: number;
  fee: number;
  type: string;
  status: string;
  description: string | null;
  sku: string | null;
  sourceId: string | null;
  stripePaymentIntentId: string | null;
  orderKey: string | null;
  reportingCategory: string | null;
  availableOn: string | null;
  stripeCreatedAt: string;
  stripeCustomerId: string | null;
  communityMemberId: string | null;
  memberEmail: string | null;
  memberName: string | null;
  stripeRaw: Record<string, unknown> | null;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  productQuickbooksItemId: string | null;
  productMatchRuleId: string | null;
  productMatchStatus: ProductMatchStatus | null;
  productMatchedAt: string | null;
  pushedToQuickbooks: boolean | null;
  quickbooksPushedAt: string | null;
  /** Set when a synced WC order matches order_key and/or WC order id. */
  linkedWcOrderId: string | null;
  linkedWcOrderNumber: string | null;
  linkedWcWcOrderId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertStripeBalanceTransactionInput = {
  stripeConnectionId: string;
  stripeBalanceTransactionId: string;
  amount: number;
  currency: string;
  net: number;
  fee: number;
  type: string;
  status: string;
  description?: string | null;
  sourceId?: string | null;
  stripePaymentIntentId?: string | null;
  reportingCategory?: string | null;
  availableOn?: Date | null;
  stripeCreatedAt: Date;
  stripeCustomerId?: string | null;
  communityMemberId?: string | null;
  stripeRaw: Record<string, unknown>;
  sku?: string | null;
};

/** Serializable copy of the Stripe API object. */
export function serializeStripeBalanceTransactionRaw(
  tx: Stripe.BalanceTransaction,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(tx)) as Record<string, unknown>;
}

/**
 * Importable balance activity: succeeded charge/payment on the balance, including
 * `pending` (funds not yet available for payout — common for recent cross-border).
 */
export function isPostedStripeBalanceTransaction(
  tx: Stripe.BalanceTransaction,
): boolean {
  if (tx.status !== "available" && tx.status !== "pending") {
    return false;
  }

  const source = tx.source;
  if (!source || typeof source === "string") {
    return true;
  }

  const obj = source as { object?: string; status?: string; paid?: boolean };
  if (obj.object === "charge") {
    return obj.status === "succeeded" || obj.paid === true;
  }
  if (obj.object === "payment_intent") {
    return obj.status === "succeeded";
  }

  return true;
}

export function mapStripeBalanceTransaction(
  connectionId: string,
  tx: Stripe.BalanceTransaction,
  member?: {
    stripeCustomerId?: string | null;
    communityMemberId?: string | null;
  },
): UpsertStripeBalanceTransactionInput {
  const stripeRaw = serializeStripeBalanceTransactionRaw(tx);
  return {
    stripeConnectionId: connectionId,
    stripeBalanceTransactionId: tx.id,
    amount: tx.amount,
    currency: tx.currency.toLowerCase(),
    net: tx.net,
    fee: tx.fee,
    type: tx.type,
    status: tx.status,
    description: tx.description,
    sourceId: typeof tx.source === "string" ? tx.source : tx.source?.id ?? null,
    stripePaymentIntentId: extractPaymentIntentIdFromStripeRaw(stripeRaw),
    reportingCategory: tx.reporting_category ?? null,
    availableOn: tx.available_on
      ? new Date(tx.available_on * 1000)
      : null,
    stripeCreatedAt: new Date(tx.created * 1000),
    stripeCustomerId: member?.stripeCustomerId ?? null,
    communityMemberId: member?.communityMemberId ?? null,
    stripeRaw,
    sku: extractSkuFromStripeRaw(stripeRaw),
  };
}

function rowToRecord(
  row: typeof stripeBalanceTransactions.$inferSelect,
  member?: { email: string | null; name: string | null } | null,
  product?: {
    code: string | null;
    name: string | null;
    quickbooksItemId: string | null;
  } | null,
  linkedWc?: {
    id: string;
    orderNumber: string | null;
    wcOrderId: number;
  } | null,
): StripeBalanceTransactionRecord {
  return {
    id: row.id,
    stripeConnectionId: row.stripeConnectionId,
    stripeBalanceTransactionId: row.stripeBalanceTransactionId,
    amount: row.amount,
    currency: row.currency,
    net: row.net,
    fee: row.fee,
    type: row.type,
    status: row.status,
    description: row.description,
    sku: row.sku,
    sourceId: row.sourceId,
    stripePaymentIntentId:
      row.stripePaymentIntentId ??
      extractPaymentIntentIdFromStripeRaw(row.stripeRaw) ??
      null,
    orderKey:
      row.orderKey ?? extractOrderKeyFromStripeRaw(row.stripeRaw ?? null),
    reportingCategory: row.reportingCategory,
    availableOn: row.availableOn?.toISOString() ?? null,
    stripeCreatedAt: row.stripeCreatedAt.toISOString(),
    stripeCustomerId: row.stripeCustomerId,
    communityMemberId: row.communityMemberId,
    memberEmail: member?.email ?? null,
    memberName: member?.name ?? null,
    stripeRaw: row.stripeRaw ?? null,
    productId: row.productId,
    productCode: product?.code ?? null,
    productName: product?.name ?? null,
    productQuickbooksItemId: product?.quickbooksItemId ?? null,
    productMatchRuleId: row.productMatchRuleId,
    productMatchStatus: (row.productMatchStatus as ProductMatchStatus | null) ?? null,
    productMatchedAt: row.productMatchedAt?.toISOString() ?? null,
    pushedToQuickbooks: row.pushedToQuickbooks,
    quickbooksPushedAt: row.quickbooksPushedAt?.toISOString() ?? null,
    linkedWcOrderId: linkedWc?.id ?? null,
    linkedWcOrderNumber: linkedWc?.orderNumber ?? null,
    linkedWcWcOrderId: linkedWc?.wcOrderId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertStripeBalanceTransactionResult =
  | { status: "created"; id: string }
  | { status: "updated"; id: string };

export async function upsertStripeBalanceTransaction(
  input: UpsertStripeBalanceTransactionInput,
): Promise<UpsertStripeBalanceTransactionResult> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({ id: stripeBalanceTransactions.id })
    .from(stripeBalanceTransactions)
    .where(
      and(
        eq(stripeBalanceTransactions.stripeConnectionId, input.stripeConnectionId),
        eq(
          stripeBalanceTransactions.stripeBalanceTransactionId,
          input.stripeBalanceTransactionId,
        ),
      ),
    )
    .limit(1);

  const memberFields = {
    stripeCustomerId: input.stripeCustomerId ?? null,
    communityMemberId: input.communityMemberId ?? null,
  };

  if (existing) {
    await db
      .update(stripeBalanceTransactions)
      .set({
        amount: input.amount,
        currency: input.currency,
        net: input.net,
        fee: input.fee,
        type: input.type,
        status: input.status,
        description: input.description ?? null,
        sourceId: input.sourceId ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        reportingCategory: input.reportingCategory ?? null,
        availableOn: input.availableOn ?? null,
        stripeCreatedAt: input.stripeCreatedAt,
        stripeRaw: input.stripeRaw,
        sku: input.sku ?? null,
        orderKey: extractOrderKeyFromStripeRaw(input.stripeRaw),
        wcOrderId: extractWcOrderIdFromStripeRaw(input.stripeRaw),
        ...memberFields,
        updatedAt: now,
      })
      .where(eq(stripeBalanceTransactions.id, existing.id));

    return { status: "updated", id: existing.id };
  }

  const [inserted] = await db
    .insert(stripeBalanceTransactions)
    .values({
      stripeConnectionId: input.stripeConnectionId,
      stripeBalanceTransactionId: input.stripeBalanceTransactionId,
      amount: input.amount,
      currency: input.currency,
      net: input.net,
      fee: input.fee,
      type: input.type,
      status: input.status,
      description: input.description ?? null,
      sourceId: input.sourceId ?? null,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      reportingCategory: input.reportingCategory ?? null,
      availableOn: input.availableOn ?? null,
      stripeCreatedAt: input.stripeCreatedAt,
      stripeRaw: input.stripeRaw,
      sku: input.sku ?? null,
      orderKey: extractOrderKeyFromStripeRaw(input.stripeRaw),
      wcOrderId: extractWcOrderIdFromStripeRaw(input.stripeRaw),
      pushedToQuickbooks: initialPushedToQuickbooks(input.stripeCreatedAt),
      ...memberFields,
    })
    .returning({ id: stripeBalanceTransactions.id });

  return { status: "created", id: inserted!.id };
}

export async function deleteAllStripeBalanceTransactions(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(stripeBalanceTransactions)
    .returning({ id: stripeBalanceTransactions.id });
  return deleted.length;
}

export type ListStripeBalanceTransactionsOptions = {
  stripeConnectionId?: string;
  pushedToQuickbooks?: "all" | "yes" | "no" | "na";
  productMatch?: "all" | ProductMatchStatus;
  /** Inclusive calendar dates (Europe/London) on stripeCreatedAt. */
  dateFrom?: IsoDateString | null;
  dateTo?: IsoDateString | null;
  /** Partial match on Stripe order_key or linked WC order number. */
  wcOrderSearch?: string;
  wcLinked?: "all" | "linked" | "not_linked";
  page?: number;
  pageSize?: number;
};

export type ListStripeBalanceTransactionsResult = {
  transactions: StripeBalanceTransactionRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildListWhere(options: ListStripeBalanceTransactionsOptions) {
  const parts = [];

  if (options.stripeConnectionId) {
    parts.push(
      eq(stripeBalanceTransactions.stripeConnectionId, options.stripeConnectionId),
    );
  }

  if (options.pushedToQuickbooks === "yes") {
    parts.push(eq(stripeBalanceTransactions.pushedToQuickbooks, true));
  } else if (options.pushedToQuickbooks === "no") {
    parts.push(eq(stripeBalanceTransactions.pushedToQuickbooks, false));
  } else if (options.pushedToQuickbooks === "na") {
    parts.push(isNull(stripeBalanceTransactions.pushedToQuickbooks));
  }

  if (options.productMatch && options.productMatch !== "all") {
    if (options.productMatch === "unmatched") {
      // Include never-classified rows (null) and explicit unmatched status.
      parts.push(
        or(
          eq(stripeBalanceTransactions.productMatchStatus, "unmatched"),
          isNull(stripeBalanceTransactions.productMatchStatus),
        ),
      );
    } else {
      parts.push(
        eq(stripeBalanceTransactions.productMatchStatus, options.productMatch),
      );
    }
  }

  if (options.dateFrom) {
    parts.push(
      calendarDateCreatedGte(
        stripeBalanceTransactions.stripeCreatedAt,
        options.dateFrom,
      ),
    );
  }
  if (options.dateTo) {
    parts.push(
      calendarDateCreatedLte(
        stripeBalanceTransactions.stripeCreatedAt,
        options.dateTo,
      ),
    );
  }

  const wcSearch = options.wcOrderSearch?.trim();
  if (wcSearch) {
    const pattern = `%${wcSearch}%`;
    const wcIdSearch = /^\d+$/.test(wcSearch)
      ? Number.parseInt(wcSearch, 10)
      : null;
    const searchParts = [
      ilike(stripeBalanceTransactions.orderKey, pattern),
      ilike(woocommerceOrders.orderNumber, pattern),
    ];
    if (wcIdSearch != null && wcIdSearch > 0) {
      searchParts.push(eq(stripeBalanceTransactions.wcOrderId, wcIdSearch));
      searchParts.push(eq(woocommerceOrders.wcOrderId, wcIdSearch));
    }
    parts.push(or(...searchParts));
  }

  if (options.wcLinked === "linked") {
    parts.push(isNotNull(woocommerceOrders.id));
  } else if (options.wcLinked === "not_linked") {
    parts.push(isNull(woocommerceOrders.id));
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

/** Distinct currency codes present in synced transactions (uppercase for display). */
export async function listStripeTransactionCurrencies(
  stripeConnectionId?: string,
): Promise<string[]> {
  const db = getDb();
  const where = stripeConnectionId
    ? eq(stripeBalanceTransactions.stripeConnectionId, stripeConnectionId)
    : undefined;

  const rows = await db
    .selectDistinct({ currency: stripeBalanceTransactions.currency })
    .from(stripeBalanceTransactions)
    .where(where)
    .orderBy(asc(stripeBalanceTransactions.currency));

  return rows.map((row) => row.currency.toUpperCase());
}

export async function listStripeBalanceTransactions(
  options: ListStripeBalanceTransactionsOptions = {},
): Promise<ListStripeBalanceTransactionsResult> {
  const pageSize = options.pageSize ?? STRIPE_TRANSACTIONS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = buildListWhere(options);

  const db = getDb();

  const wcJoin = stripeTransactionMatchesWooCommerceOrder();

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(stripeBalanceTransactions)
    .leftJoin(woocommerceOrders, wcJoin)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select({
      transaction: stripeBalanceTransactions,
      memberEmail: communityMembers.email,
      memberName: communityMembers.name,
      productCode: products.code,
      productName: products.name,
      productQuickbooksItemId: products.quickbooksItemId,
      linkedWcOrderId: woocommerceOrders.id,
      linkedWcOrderNumber: woocommerceOrders.orderNumber,
      linkedWcWcOrderId: woocommerceOrders.wcOrderId,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(
      communityMembers,
      eq(stripeBalanceTransactions.communityMemberId, communityMembers.id),
    )
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .leftJoin(woocommerceOrders, wcJoin)
    .where(where)
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    transactions: rows.map((row) =>
      rowToRecord(
        row.transaction,
        { email: row.memberEmail, name: row.memberName },
        {
          code: row.productCode,
          name: row.productName,
          quickbooksItemId: row.productQuickbooksItemId,
        },
        row.linkedWcOrderId
          ? {
              id: row.linkedWcOrderId,
              orderNumber: row.linkedWcOrderNumber,
              wcOrderId: row.linkedWcWcOrderId!,
            }
          : null,
      ),
    ),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

const UNMAPPED_STRIPE_LOTUS_KEY = "__unmapped__";

export type StripeTransactionLineAggregate = {
  label: string;
  type: string;
  sku: string | null;
  currency: string;
  count: number;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
};

export type StripeLotusProductAggregate = {
  catalogProductId: string | null;
  code: string | null;
  name: string;
  unmapped: boolean;
  lines: StripeTransactionLineAggregate[];
  subtotals: {
    currency: string;
    grossMinor: number;
    feeMinor: number;
    netMinor: number;
  }[];
};

export type StripeTransactionsByProductResult = {
  transactionCount: number;
  groups: StripeLotusProductAggregate[];
  grandTotals: {
    currency: string;
    grossMinor: number;
    feeMinor: number;
    netMinor: number;
  }[];
};

function stripeLineKey(input: {
  type: string;
  description: string | null;
  sku: string | null;
  stripeRaw: Record<string, unknown> | null;
}): string {
  const signals = extractStripeTransactionProductSignals({
    stripeRaw: input.stripeRaw,
    description: input.description,
    sku: input.sku,
  });
  const name =
    signals.lineItem1 ??
    signals.lineItemsSummary ??
    signals.description ??
    "";
  return `${input.type}\0${name}\0${input.sku ?? ""}`;
}

function stripeLineLabel(input: {
  type: string;
  description: string | null;
  sku: string | null;
  stripeRaw: Record<string, unknown> | null;
}): string {
  const signals = extractStripeTransactionProductSignals({
    stripeRaw: input.stripeRaw,
    description: input.description,
    sku: input.sku,
  });
  const name =
    signals.lineItem1 ??
    signals.lineItemsSummary ??
    signals.description ??
    input.type.replace(/_/g, " ");
  const parts = [name];
  if (input.sku) parts.push(`[${input.sku}]`);
  parts.push(`(${input.type})`);
  return parts.join(" ");
}

type StripeLineBucket = {
  label: string;
  type: string;
  sku: string | null;
  byCurrency: Map<
    string,
    { count: number; grossMinor: number; feeMinor: number; netMinor: number }
  >;
};

type StripeLotusBucket = {
  catalogProductId: string | null;
  code: string | null;
  name: string;
  unmapped: boolean;
  lines: Map<string, StripeLineBucket>;
};

export async function aggregateStripeTransactionsByProduct(
  options: Omit<ListStripeBalanceTransactionsOptions, "page" | "pageSize"> = {},
): Promise<StripeTransactionsByProductResult> {
  const db = getDb();
  const where = buildListWhere(options);

  const rows = await db
    .select({
      amount: stripeBalanceTransactions.amount,
      fee: stripeBalanceTransactions.fee,
      net: stripeBalanceTransactions.net,
      currency: stripeBalanceTransactions.currency,
      type: stripeBalanceTransactions.type,
      description: stripeBalanceTransactions.description,
      sku: stripeBalanceTransactions.sku,
      stripeRaw: stripeBalanceTransactions.stripeRaw,
      productId: stripeBalanceTransactions.productId,
      productCode: products.code,
      productName: products.name,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .leftJoin(woocommerceOrders, stripeTransactionMatchesWooCommerceOrder())
    .where(where);

  const buckets = new Map<string, StripeLotusBucket>();

  function ensureLotusBucket(key: string, lotus: {
    catalogProductId: string | null;
    code: string | null;
    name: string;
    unmapped: boolean;
  }): StripeLotusBucket {
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

  for (const row of rows) {
    const lotus = row.productId
      ? {
          key: row.productId,
          catalogProductId: row.productId,
          code: row.productCode,
          name: row.productName ?? row.productCode ?? "Product",
          unmapped: false,
        }
      : {
          key: UNMAPPED_STRIPE_LOTUS_KEY,
          catalogProductId: null,
          code: null,
          name: "Unmapped",
          unmapped: true,
        };

    const lotusBucket = ensureLotusBucket(lotus.key, lotus);
    const lineKey = stripeLineKey(row);
    let lineBucket = lotusBucket.lines.get(lineKey);
    if (!lineBucket) {
      lineBucket = {
        label: stripeLineLabel(row),
        type: row.type,
        sku: row.sku,
        byCurrency: new Map(),
      };
      lotusBucket.lines.set(lineKey, lineBucket);
    }

    const existing = lineBucket.byCurrency.get(row.currency) ?? {
      count: 0,
      grossMinor: 0,
      feeMinor: 0,
      netMinor: 0,
    };
    lineBucket.byCurrency.set(row.currency, {
      count: existing.count + 1,
      grossMinor: existing.grossMinor + row.amount,
      feeMinor: existing.feeMinor + row.fee,
      netMinor: existing.netMinor + row.net,
    });
  }

  const grandByCurrency = new Map<
    string,
    { grossMinor: number; feeMinor: number; netMinor: number }
  >();

  const groups: StripeLotusProductAggregate[] = [...buckets.values()]
    .map((bucket) => {
      const lines: StripeTransactionLineAggregate[] = [];
      const subByCurrency = new Map<
        string,
        { grossMinor: number; feeMinor: number; netMinor: number }
      >();

      for (const lineBucket of bucket.lines.values()) {
        for (const [cur, totals] of lineBucket.byCurrency) {
          lines.push({
            label: lineBucket.label,
            type: lineBucket.type,
            sku: lineBucket.sku,
            currency: cur,
            count: totals.count,
            grossMinor: totals.grossMinor,
            feeMinor: totals.feeMinor,
            netMinor: totals.netMinor,
          });

          const sub = subByCurrency.get(cur) ?? {
            grossMinor: 0,
            feeMinor: 0,
            netMinor: 0,
          };
          subByCurrency.set(cur, {
            grossMinor: sub.grossMinor + totals.grossMinor,
            feeMinor: sub.feeMinor + totals.feeMinor,
            netMinor: sub.netMinor + totals.netMinor,
          });

          const grand = grandByCurrency.get(cur) ?? {
            grossMinor: 0,
            feeMinor: 0,
            netMinor: 0,
          };
          grandByCurrency.set(cur, {
            grossMinor: grand.grossMinor + totals.grossMinor,
            feeMinor: grand.feeMinor + totals.feeMinor,
            netMinor: grand.netMinor + totals.netMinor,
          });
        }
      }

      lines.sort((a, b) => {
        const label = a.label.localeCompare(b.label);
        if (label !== 0) return label;
        return a.currency.localeCompare(b.currency);
      });

      const subtotals = [...subByCurrency.entries()]
        .map(([currency, totals]) => ({ currency, ...totals }))
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
    .map(([currency, totals]) => ({ currency, ...totals }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    transactionCount: rows.length,
    groups,
    grandTotals,
  };
}

export type StripeBalanceTransactionDetail = StripeBalanceTransactionRecord & {
  connectionLabel: string | null;
  livemode: boolean;
};

export async function getStripeBalanceTransactionById(
  id: string,
): Promise<StripeBalanceTransactionDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      transaction: stripeBalanceTransactions,
      connectionLabel: stripeConnections.label,
      livemode: stripeConnections.livemode,
      memberEmail: communityMembers.email,
      memberName: communityMembers.name,
      productCode: products.code,
      productName: products.name,
      productQuickbooksItemId: products.quickbooksItemId,
    })
    .from(stripeBalanceTransactions)
    .innerJoin(
      stripeConnections,
      eq(stripeBalanceTransactions.stripeConnectionId, stripeConnections.id),
    )
    .leftJoin(
      communityMembers,
      eq(stripeBalanceTransactions.communityMemberId, communityMembers.id),
    )
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(eq(stripeBalanceTransactions.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...rowToRecord(
      row.transaction,
      { email: row.memberEmail, name: row.memberName },
      {
        code: row.productCode,
        name: row.productName,
        quickbooksItemId: row.productQuickbooksItemId,
      },
    ),
    connectionLabel: row.connectionLabel,
    livemode: row.livemode,
  };
}

export type StripeBalanceTransactionForMember = StripeBalanceTransactionRecord & {
  connectionLabel: string | null;
};

export type ListStripeBalanceTransactionsForMemberResult = {
  transactions: StripeBalanceTransactionForMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListStripeBalanceTransactionsForMemberOptions = {
  communityMemberId: string;
  page?: number;
  pageSize?: number;
};

export type StripeGrossByCurrency = {
  currency: string;
  amountMinor: number;
};

/** Sum Stripe balance `amount` (gross, minor units) per member and currency. */
export async function sumStripeGrossByCommunityMemberIds(
  memberIds: string[],
): Promise<Map<string, StripeGrossByCurrency[]>> {
  const result = new Map<string, StripeGrossByCurrency[]>();
  if (memberIds.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      communityMemberId: stripeBalanceTransactions.communityMemberId,
      currency: stripeBalanceTransactions.currency,
      totalMinor: sum(stripeBalanceTransactions.amount),
    })
    .from(stripeBalanceTransactions)
    .where(
      and(
        inArray(stripeBalanceTransactions.communityMemberId, memberIds),
        gt(stripeBalanceTransactions.amount, 0),
      ),
    )
    .groupBy(
      stripeBalanceTransactions.communityMemberId,
      stripeBalanceTransactions.currency,
    );

  for (const row of rows) {
    if (!row.communityMemberId) continue;
    const total = Number(row.totalMinor ?? 0);
    if (total <= 0) continue;
    const list = result.get(row.communityMemberId) ?? [];
    list.push({ currency: row.currency, amountMinor: total });
    result.set(row.communityMemberId, list);
  }

  for (const [, totals] of result) {
    totals.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  return result;
}

export async function countStripeBalanceTransactionsForMember(
  communityMemberId: string,
): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.communityMemberId, communityMemberId));
  return value;
}

export async function listStripeBalanceTransactionsForMember(
  options: ListStripeBalanceTransactionsForMemberOptions,
): Promise<ListStripeBalanceTransactionsForMemberResult> {
  const pageSize = options.pageSize ?? STRIPE_TRANSACTIONS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = eq(
    stripeBalanceTransactions.communityMemberId,
    options.communityMemberId,
  );

  const db = getDb();

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(stripeBalanceTransactions)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select({
      transaction: stripeBalanceTransactions,
      memberEmail: communityMembers.email,
      memberName: communityMembers.name,
      connectionLabel: stripeConnections.label,
      productCode: products.code,
      productName: products.name,
      productQuickbooksItemId: products.quickbooksItemId,
    })
    .from(stripeBalanceTransactions)
    .innerJoin(
      stripeConnections,
      eq(stripeBalanceTransactions.stripeConnectionId, stripeConnections.id),
    )
    .leftJoin(
      communityMembers,
      eq(stripeBalanceTransactions.communityMemberId, communityMembers.id),
    )
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(where)
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    transactions: rows.map((row) => ({
      ...rowToRecord(
        row.transaction,
        { email: row.memberEmail, name: row.memberName },
        {
          code: row.productCode,
          name: row.productName,
          quickbooksItemId: row.productQuickbooksItemId,
        },
      ),
      connectionLabel: row.connectionLabel,
    })),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function countStripeBalanceTransactions(
  stripeConnectionId?: string,
): Promise<number> {
  const db = getDb();
  const where = stripeConnectionId
    ? eq(stripeBalanceTransactions.stripeConnectionId, stripeConnectionId)
    : undefined;

  const [{ value }] = await db
    .select({ value: count() })
    .from(stripeBalanceTransactions)
    .where(where);

  return value;
}

/** Fill `stripe_payment_intent_id` from stored `stripe_raw` (no Stripe API calls). */
export async function backfillStripePaymentIntentIds(options?: {
  batchSize?: number;
}): Promise<{ scanned: number; updated: number }> {
  const db = getDb();
  const batchSize = options?.batchSize ?? 500;
  let scanned = 0;
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const where = cursor
      ? and(
          isNull(stripeBalanceTransactions.stripePaymentIntentId),
          gt(stripeBalanceTransactions.id, cursor),
        )
      : isNull(stripeBalanceTransactions.stripePaymentIntentId);

    const rows = await db
      .select({
        id: stripeBalanceTransactions.id,
        stripeRaw: stripeBalanceTransactions.stripeRaw,
      })
      .from(stripeBalanceTransactions)
      .where(where)
      .orderBy(asc(stripeBalanceTransactions.id))
      .limit(batchSize);

    if (rows.length === 0) break;

    const now = new Date();
    const toUpdate: { id: string; stripePaymentIntentId: string }[] = [];
    for (const row of rows) {
      scanned += 1;
      const paymentIntentId = extractPaymentIntentIdFromStripeRaw(row.stripeRaw);
      if (paymentIntentId) {
        toUpdate.push({ id: row.id, stripePaymentIntentId: paymentIntentId });
      }
    }

    if (toUpdate.length > 0) {
      await db.transaction(async (tx) => {
        await Promise.all(
          toUpdate.map((row) =>
            tx
              .update(stripeBalanceTransactions)
              .set({
                stripePaymentIntentId: row.stripePaymentIntentId,
                updatedAt: now,
              })
              .where(eq(stripeBalanceTransactions.id, row.id)),
          ),
        );
      });
      updated += toUpdate.length;
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < batchSize) break;
  }

  return { scanned, updated };
}

/**
 * Link guest/Donorbox transactions to community members from `stripe_raw`
 * (billing_details.email or metadata.donorbox_*). No Stripe API calls.
 */
export async function backfillStripeTransactionCommunityLinks(options?: {
  batchSize?: number;
}): Promise<{
  scanned: number;
  linked: number;
  enriched: number;
  skippedNoEmail: number;
}> {
  const db = getDb();
  const batchSize = options?.batchSize ?? 200;
  let scanned = 0;
  let linked = 0;
  let enriched = 0;
  let skippedNoEmail = 0;
  let cursor: string | undefined;

  for (;;) {
    const where = cursor
      ? and(
          isNull(stripeBalanceTransactions.communityMemberId),
          isNull(stripeBalanceTransactions.stripeCustomerId),
          isNotNull(stripeBalanceTransactions.stripeRaw),
          gt(stripeBalanceTransactions.id, cursor),
        )
      : and(
          isNull(stripeBalanceTransactions.communityMemberId),
          isNull(stripeBalanceTransactions.stripeCustomerId),
          isNotNull(stripeBalanceTransactions.stripeRaw),
        );

    const rows = await db
      .select({
        id: stripeBalanceTransactions.id,
        stripeRaw: stripeBalanceTransactions.stripeRaw,
        stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      })
      .from(stripeBalanceTransactions)
      .where(where)
      .orderBy(asc(stripeBalanceTransactions.id))
      .limit(batchSize);

    if (rows.length === 0) break;

    const now = new Date();
    for (const row of rows) {
      scanned += 1;
      const billing = extractStripeGuestBillingFromStripeRaw(row.stripeRaw);
      if (!billing) {
        skippedNoEmail += 1;
        continue;
      }

      const member = await ensureCommunityMemberForEmail({
        email: billing.email,
        name: billing.name,
        address: billing.address,
        joinedAt: row.stripeCreatedAt,
      });

      if (!member.communityMemberId) {
        skippedNoEmail += 1;
        continue;
      }

      await db
        .update(stripeBalanceTransactions)
        .set({
          communityMemberId: member.communityMemberId,
          updatedAt: now,
        })
        .where(eq(stripeBalanceTransactions.id, row.id));

      linked += 1;
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < batchSize) break;
  }

  // Enrich existing members from Donorbox metadata on already-linked guest txns.
  let enrichCursor: string | undefined;
  const donorboxInRaw = sql`stripe_raw::text like '%donorbox_email%'`;
  for (;;) {
    const enrichWhere = enrichCursor
      ? and(
          isNotNull(stripeBalanceTransactions.communityMemberId),
          isNull(stripeBalanceTransactions.stripeCustomerId),
          isNotNull(stripeBalanceTransactions.stripeRaw),
          donorboxInRaw,
          gt(stripeBalanceTransactions.id, enrichCursor),
        )
      : and(
          isNotNull(stripeBalanceTransactions.communityMemberId),
          isNull(stripeBalanceTransactions.stripeCustomerId),
          isNotNull(stripeBalanceTransactions.stripeRaw),
          donorboxInRaw,
        );

    const enrichRows = await db
      .select({
        id: stripeBalanceTransactions.id,
        stripeRaw: stripeBalanceTransactions.stripeRaw,
        stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      })
      .from(stripeBalanceTransactions)
      .where(enrichWhere)
      .orderBy(asc(stripeBalanceTransactions.id))
      .limit(batchSize);

    if (enrichRows.length === 0) break;

    for (const row of enrichRows) {
      const billing = extractStripeGuestBillingFromStripeRaw(row.stripeRaw);
      if (!billing) continue;

      await ensureCommunityMemberForEmail({
        email: billing.email,
        name: billing.name,
        address: billing.address,
        joinedAt: row.stripeCreatedAt,
      });
      enriched += 1;
    }

    enrichCursor = enrichRows[enrichRows.length - 1]!.id;
    if (enrichRows.length < batchSize) break;
  }

  return { scanned, linked, enriched, skippedNoEmail };
}
