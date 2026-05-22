import type Stripe from "stripe";
import { ensureCommunityMemberForStripeCustomer } from "./community-members.server";
import {
  getStripeClientForConnection,
  getStripeConnectionById,
  listStripeConnections,
} from "./stripe-connections.server";
import { extractStripeCustomerIdFromBalanceTransaction } from "./stripe-customer.server";
import { classifyStripeTransactionById } from "./product-classification.server";
import {
  isPostedStripeBalanceTransaction,
  mapStripeBalanceTransaction,
  upsertStripeBalanceTransaction,
} from "./stripe-balance-transactions.server";

export type SyncStripeTransactionsOptions = {
  connectionId?: string;
  /** Only import balance transactions created within the last N days. Ignored when `since` is set. */
  days?: number;
  /** Only import balance transactions created on or after this instant (UTC calendar date if YYYY-MM-DD). */
  since?: Date;
};

export type SyncStripeTransactionsResult = {
  connectionsProcessed: number;
  created: number;
  updated: number;
  skippedNotPosted: number;
  membersLinked: number;
  classified: number;
  classificationSkippedManual: number;
  daysLimit?: number;
  since?: string;
  stoppedAtCutoff: boolean;
};

function createdSinceFromDays(days?: number): Date | undefined {
  if (days === undefined || !Number.isFinite(days) || days <= 0) {
    return undefined;
  }
  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  return since;
}

/** Start of UTC calendar day for `YYYY-MM-DD`. */
export function parseSyncSinceDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --since date "${value}" (use YYYY-MM-DD)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid --since date "${value}"`);
  }
  return date;
}

function resolveCreatedGte(
  options: Pick<SyncStripeTransactionsOptions, "days" | "since">,
): Date | undefined {
  if (options.since) return options.since;
  return createdSinceFromDays(options.days);
}

async function* iterateBalanceTransactions(
  stripe: Stripe,
  createdGte?: Date,
): AsyncGenerator<Stripe.BalanceTransaction> {
  let startingAfter: string | undefined;
  const createdGteUnix = createdGte
    ? Math.floor(createdGte.getTime() / 1000)
    : undefined;

  for (;;) {
    const page = await stripe.balanceTransactions.list({
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.source"],
      ...(createdGteUnix !== undefined
        ? { created: { gte: createdGteUnix } }
        : {}),
    });

    for (const tx of page.data) {
      yield tx;
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

export async function syncStripeBalanceTransactions(
  options: SyncStripeTransactionsOptions = {},
): Promise<SyncStripeTransactionsResult> {
  const createdGte = resolveCreatedGte(options);
  const totals: SyncStripeTransactionsResult = {
    connectionsProcessed: 0,
    created: 0,
    updated: 0,
    skippedNotPosted: 0,
    membersLinked: 0,
    classified: 0,
    classificationSkippedManual: 0,
    daysLimit: options.since ? undefined : createdGte ? options.days : undefined,
    since: options.since?.toISOString(),
    stoppedAtCutoff: false,
  };

  const connectionIds: string[] = [];

  if (options.connectionId) {
    const row = await getStripeConnectionById(options.connectionId);
    if (!row) {
      throw new Error(`Stripe connection not found: ${options.connectionId}`);
    }
    connectionIds.push(row.id);
  } else {
    const connections = await listStripeConnections();
    if (connections.length === 0) {
      throw new Error(
        "No Stripe connections in the database. Add one at /integrations/stripe first.",
      );
    }
    connectionIds.push(...connections.map((c) => c.id));
  }

  for (const connectionId of connectionIds) {
    totals.connectionsProcessed += 1;
    const stripe = await getStripeClientForConnection(connectionId);
    let connectionProcessed = 0;

    for await (const tx of iterateBalanceTransactions(stripe, createdGte)) {
      connectionProcessed += 1;
      if (connectionProcessed % 100 === 0) {
        console.log(
          `  … ${connectionProcessed} Stripe txns processed (connection ${totals.connectionsProcessed}/${connectionIds.length})`,
        );
      }
      if (!isPostedStripeBalanceTransaction(tx)) {
        totals.skippedNotPosted += 1;
        continue;
      }

      const customerId = extractStripeCustomerIdFromBalanceTransaction(tx);
      let memberLink: {
        stripeCustomerId?: string | null;
        communityMemberId?: string | null;
      } = {};

      if (customerId) {
        const member = await ensureCommunityMemberForStripeCustomer(
          stripe,
          connectionId,
          customerId,
        );
        memberLink = {
          stripeCustomerId: customerId,
          communityMemberId: member.communityMemberId,
        };
        if (member.communityMemberId) {
          totals.membersLinked += 1;
        }
      }

      const result = await upsertStripeBalanceTransaction(
        mapStripeBalanceTransaction(connectionId, tx, memberLink),
      );

      if (result.status === "created") {
        totals.created += 1;
      } else {
        totals.updated += 1;
      }

      const classified = await classifyStripeTransactionById(result.id);
      if (classified?.skippedManual) {
        totals.classificationSkippedManual += 1;
      } else if (classified) {
        totals.classified += 1;
      }
    }
  }

  return totals;
}
