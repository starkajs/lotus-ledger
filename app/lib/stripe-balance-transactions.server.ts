import type Stripe from "stripe";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  communityMembers,
  stripeBalanceTransactions,
  stripeConnections,
} from "~/db/schema";

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
  sourceId: string | null;
  reportingCategory: string | null;
  availableOn: string | null;
  stripeCreatedAt: string;
  stripeCustomerId: string | null;
  communityMemberId: string | null;
  memberEmail: string | null;
  memberName: string | null;
  stripeRaw: Record<string, unknown> | null;
  pushedToQuickbooks: boolean;
  quickbooksPushedAt: string | null;
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
  reportingCategory?: string | null;
  availableOn?: Date | null;
  stripeCreatedAt: Date;
  stripeCustomerId?: string | null;
  communityMemberId?: string | null;
  stripeRaw: Record<string, unknown>;
};

/** Serializable copy of the Stripe API object. */
export function serializeStripeBalanceTransactionRaw(
  tx: Stripe.BalanceTransaction,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(tx)) as Record<string, unknown>;
}

/**
 * Posted to the Stripe balance (`status === available`) and, when the source is
 * expanded, the underlying charge/payment succeeded.
 */
export function isPostedStripeBalanceTransaction(
  tx: Stripe.BalanceTransaction,
): boolean {
  if (tx.status !== "available") {
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
    reportingCategory: tx.reporting_category ?? null,
    availableOn: tx.available_on
      ? new Date(tx.available_on * 1000)
      : null,
    stripeCreatedAt: new Date(tx.created * 1000),
    stripeCustomerId: member?.stripeCustomerId ?? null,
    communityMemberId: member?.communityMemberId ?? null,
    stripeRaw: serializeStripeBalanceTransactionRaw(tx),
  };
}

function rowToRecord(
  row: typeof stripeBalanceTransactions.$inferSelect,
  member?: { email: string | null; name: string | null } | null,
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
    sourceId: row.sourceId,
    reportingCategory: row.reportingCategory,
    availableOn: row.availableOn?.toISOString() ?? null,
    stripeCreatedAt: row.stripeCreatedAt.toISOString(),
    stripeCustomerId: row.stripeCustomerId,
    communityMemberId: row.communityMemberId,
    memberEmail: member?.email ?? null,
    memberName: member?.name ?? null,
    stripeRaw: row.stripeRaw ?? null,
    pushedToQuickbooks: row.pushedToQuickbooks,
    quickbooksPushedAt: row.quickbooksPushedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertStripeBalanceTransactionResult =
  | { status: "created" }
  | { status: "updated" };

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
        reportingCategory: input.reportingCategory ?? null,
        availableOn: input.availableOn ?? null,
        stripeCreatedAt: input.stripeCreatedAt,
        stripeRaw: input.stripeRaw,
        ...memberFields,
        updatedAt: now,
      })
      .where(eq(stripeBalanceTransactions.id, existing.id));

    return { status: "updated" };
  }

  await db.insert(stripeBalanceTransactions).values({
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
    reportingCategory: input.reportingCategory ?? null,
    availableOn: input.availableOn ?? null,
    stripeCreatedAt: input.stripeCreatedAt,
    stripeRaw: input.stripeRaw,
    ...memberFields,
  });

  return { status: "created" };
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
  pushedToQuickbooks?: "all" | "yes" | "no";
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
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export async function listStripeBalanceTransactions(
  options: ListStripeBalanceTransactionsOptions = {},
): Promise<ListStripeBalanceTransactionsResult> {
  const pageSize = options.pageSize ?? STRIPE_TRANSACTIONS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = buildListWhere(options);

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
    })
    .from(stripeBalanceTransactions)
    .leftJoin(
      communityMembers,
      eq(stripeBalanceTransactions.communityMemberId, communityMembers.id),
    )
    .where(where)
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    transactions: rows.map((row) =>
      rowToRecord(row.transaction, {
        email: row.memberEmail,
        name: row.memberName,
      }),
    ),
    total,
    page: safePage,
    pageSize,
    totalPages,
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
    .where(eq(stripeBalanceTransactions.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...rowToRecord(row.transaction, {
      email: row.memberEmail,
      name: row.memberName,
    }),
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
    .where(where)
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    transactions: rows.map((row) => ({
      ...rowToRecord(row.transaction, {
        email: row.memberEmail,
        name: row.memberName,
      }),
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
