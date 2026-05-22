import type Stripe from "stripe";
import { ensureCommunityMemberForStripeCustomer } from "./community-members.server";
import {
  getStripeClientForConnection,
  getStripeConnectionById,
  listStripeConnections,
} from "./stripe-connections.server";
import { extractStripeCustomerIdFromBalanceTransaction } from "./stripe-customer.server";
import {
  isPostedStripeBalanceTransaction,
  mapStripeBalanceTransaction,
  upsertStripeBalanceTransaction,
} from "./stripe-balance-transactions.server";

export type SyncStripeTransactionsOptions = {
  connectionId?: string;
  /** Only import balance transactions created within the last N days. */
  days?: number;
};

export type SyncStripeTransactionsResult = {
  connectionsProcessed: number;
  created: number;
  updated: number;
  skippedNotPosted: number;
  membersLinked: number;
  daysLimit?: number;
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

async function* iterateBalanceTransactions(
  stripe: Stripe,
  createdSince?: Date,
): AsyncGenerator<Stripe.BalanceTransaction> {
  let startingAfter: string | undefined;
  const createdSinceUnix = createdSince
    ? Math.floor(createdSince.getTime() / 1000)
    : undefined;

  for (;;) {
    const page = await stripe.balanceTransactions.list({
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.source"],
    });

    let hitCutoff = false;
    for (const tx of page.data) {
      if (createdSinceUnix !== undefined && tx.created < createdSinceUnix) {
        hitCutoff = true;
        break;
      }
      yield tx;
    }

    if (hitCutoff || !page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

export async function syncStripeBalanceTransactions(
  options: SyncStripeTransactionsOptions = {},
): Promise<SyncStripeTransactionsResult> {
  const createdSince = createdSinceFromDays(options.days);
  const totals: SyncStripeTransactionsResult = {
    connectionsProcessed: 0,
    created: 0,
    updated: 0,
    skippedNotPosted: 0,
    membersLinked: 0,
    daysLimit: createdSince ? options.days : undefined,
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

    let hitCutoff = false;

    for await (const tx of iterateBalanceTransactions(stripe, createdSince)) {
      if (createdSince && tx.created * 1000 < createdSince.getTime()) {
        hitCutoff = true;
        break;
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
    }

    if (hitCutoff) {
      totals.stoppedAtCutoff = true;
    }
  }

  return totals;
}
