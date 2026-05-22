import type Stripe from "stripe";
import { getStripeMode } from "./env.server";
import { getStripe } from "./stripe.server";

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
  mode: "test" | "live";
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
  limit?: number;
  startingAfter?: string;
};

export async function fetchStripeTransactions(
  options: FetchStripeTransactionsOptions = {},
): Promise<StripeTransactionsResult> {
  const stripe = getStripe();
  const limit = Math.min(options.limit ?? 25, 100);

  const page = await stripe.balanceTransactions.list({
    limit,
    starting_after: options.startingAfter,
  });

  return {
    transactions: page.data.map(mapBalanceTransaction),
    hasMore: page.has_more,
    mode: getStripeMode(),
  };
}

export async function verifyStripeConnection(): Promise<{
  ok: boolean;
  currency?: string;
  availableBalance?: number;
  mode: "test" | "live";
  error?: string;
}> {
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    const primary = balance.available[0];

    return {
      ok: true,
      currency: primary?.currency,
      availableBalance: primary
        ? formatAmount(primary.amount, primary.currency)
        : undefined,
      mode: getStripeMode(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return { ok: false, mode: getStripeMode(), error: message };
  }
}
