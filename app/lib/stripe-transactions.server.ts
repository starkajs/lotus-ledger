import type Stripe from "stripe";
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
