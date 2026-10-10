import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "~/db";
import { stripeBalanceTransactions } from "~/db/schema";
import { minorUnitsToMajor } from "~/lib/money";
import { mapStripeBalanceTransaction } from "./stripe-balance-transactions.server";
import { getStripeClientForConnection } from "./stripe-connections.server";

export type StripeTransactionSummary = {
  id: string;
  amount: number;
  currency: string;
  net: number;
  fee: number;
  type: string;
  description: string | null;
  created: string;
  status: string;
  sourceId: string | null;
  reportingCategory: string | null;
};

export type StripeTransactionsResult = {
  transactions: StripeTransactionSummary[];
  hasMore: boolean;
  livemode: boolean;
};

function mapBalanceTransaction(tx: Stripe.BalanceTransaction): StripeTransactionSummary {
  const mapped = mapStripeBalanceTransaction("", tx);
  const currency = mapped.currency;
  return {
    id: mapped.stripeBalanceTransactionId,
    amount: minorUnitsToMajor(mapped.amount, currency),
    currency,
    net: minorUnitsToMajor(mapped.net, currency),
    fee: minorUnitsToMajor(mapped.fee, currency),
    type: mapped.type,
    description: mapped.description ?? null,
    created: mapped.stripeCreatedAt.toISOString(),
    status: mapped.status,
    sourceId: mapped.sourceId ?? null,
    reportingCategory: mapped.reportingCategory ?? null,
  };
}

export type FetchStripeTransactionsOptions = {
  connectionId: string;
  limit?: number;
  startingAfter?: string;
};

/** Recent balance transactions already stored for one account. Does not call Stripe. */
export async function listRecentStoredStripeTransactions(
  connectionId: string,
  limit = 25,
): Promise<{ transactions: StripeTransactionSummary[]; hasMore: boolean }> {
  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.stripeBalanceTransactionId,
      amount: stripeBalanceTransactions.amount,
      currency: stripeBalanceTransactions.currency,
      net: stripeBalanceTransactions.net,
      fee: stripeBalanceTransactions.fee,
      type: stripeBalanceTransactions.type,
      description: stripeBalanceTransactions.description,
      created: stripeBalanceTransactions.stripeCreatedAt,
      status: stripeBalanceTransactions.status,
      sourceId: stripeBalanceTransactions.sourceId,
      reportingCategory: stripeBalanceTransactions.reportingCategory,
    })
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.stripeConnectionId, connectionId))
    .orderBy(desc(stripeBalanceTransactions.stripeCreatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    hasMore,
    transactions: page.map((row) => ({
      id: row.id,
      amount: minorUnitsToMajor(row.amount, row.currency),
      currency: row.currency,
      net: minorUnitsToMajor(row.net, row.currency),
      fee: minorUnitsToMajor(row.fee, row.currency),
      type: row.type,
      description: row.description,
      created: row.created.toISOString(),
      status: row.status,
      sourceId: row.sourceId,
      reportingCategory: row.reportingCategory,
    })),
  };
}

export async function fetchStripeTransactions(
  options: FetchStripeTransactionsOptions,
): Promise<StripeTransactionsResult> {
  const stripe = await getStripeClientForConnection(options.connectionId);
  const limit = Math.min(options.limit ?? 25, 100);

  const page = await stripe.balanceTransactions.list({
    limit,
    starting_after: options.startingAfter,
  });

  const balance = await stripe.balance.retrieve();

  return {
    transactions: page.data.map(mapBalanceTransaction),
    hasMore: page.has_more,
    livemode: balance.livemode,
  };
}
