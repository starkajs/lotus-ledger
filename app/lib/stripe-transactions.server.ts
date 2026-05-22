import type Stripe from "stripe";
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
};

export type StripeTransactionsResult = {
  transactions: StripeTransactionSummary[];
  hasMore: boolean;
  livemode: boolean;
};

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function formatAmount(cents: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency.toLowerCase())) {
    return cents;
  }
  return cents / 100;
}

function mapBalanceTransaction(tx: Stripe.BalanceTransaction): StripeTransactionSummary {
  const currency = tx.currency.toLowerCase();
  return {
    id: tx.id,
    amount: formatAmount(tx.amount, currency),
    currency,
    net: formatAmount(tx.net, currency),
    fee: formatAmount(tx.fee, currency),
    type: tx.type,
    description: tx.description,
    created: new Date(tx.created * 1000).toISOString(),
    status: tx.status,
    sourceId: typeof tx.source === "string" ? tx.source : tx.source?.id ?? null,
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
