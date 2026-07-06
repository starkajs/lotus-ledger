import type Stripe from "stripe";
import { ensureCommunityMemberForStripeCustomer } from "./community-members.server";
import {
  getStripeClientForConnection,
  getStripeConnectionById,
  listStripeConnections,
} from "./stripe-connections.server";
import { ensureCommunityMemberForEmail } from "./community-members.server";
import {
  extractStripeCustomerIdFromBalanceTransaction,
  extractStripeGuestBillingFromBalanceTransaction,
} from "./stripe-customer.server";
import {
  runIntegrationJob,
  type IntegrationAuditContext,
} from "./integration-jobs.server";
import { classifyStripeTransactionById } from "./product-classification.server";
import {
  isPostedStripeBalanceTransaction,
  mapStripeBalanceTransaction,
  upsertStripeBalanceTransaction,
} from "./stripe-balance-transactions.server";
import { STRIPE_APP_SYNC_DAYS } from "./stripe-sync.constants";

export type SyncStripeTransactionsOptions = {
  connectionId?: string;
  /** Only import balance transactions created within the last N days. Ignored when `since` is set. */
  days?: number;
  /** Only import balance transactions created on or after this instant (UTC calendar date if YYYY-MM-DD). */
  since?: Date;
  audit?: IntegrationAuditContext;
};

export type SyncStripeTransactionsResult = {
  connectionsProcessed: number;
  created: number;
  updated: number;
  processed: number;
  skippedNotPosted: number;
  membersLinked: number;
  classified: number;
  classificationSkippedManual: number;
  daysLimit?: number;
  since?: string;
  createdGte?: string;
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

async function syncStripeBalanceTransactionsInner(
  options: SyncStripeTransactionsOptions,
  jobId: string,
): Promise<SyncStripeTransactionsResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  const daysLimit =
    options.since != null
      ? undefined
      : options.days && options.days > 0
        ? Math.floor(options.days)
        : STRIPE_APP_SYNC_DAYS;

  const createdGte =
    options.since ?? createdSinceFromDays(daysLimit ?? STRIPE_APP_SYNC_DAYS);

  if (!createdGte) {
    throw new Error(
      "Stripe balance transaction sync requires a date window — refusing to import full history",
    );
  }

  console.log(
    `  Stripe window: ${options.since ? `since ${options.since.toISOString()}` : `last ${daysLimit} day(s)`}; created>=${createdGte.toISOString()}`,
  );

  const totals: SyncStripeTransactionsResult = {
    connectionsProcessed: 0,
    created: 0,
    updated: 0,
    processed: 0,
    skippedNotPosted: 0,
    membersLinked: 0,
    classified: 0,
    classificationSkippedManual: 0,
    daysLimit,
    since: options.since?.toISOString(),
    createdGte: createdGte.toISOString(),
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
    for await (const tx of iterateBalanceTransactions(stripe, createdGte)) {
      totals.processed += 1;
      if (totals.processed % 100 === 0) {
        console.log(
          `  … ${totals.processed} Stripe txns processed (connection ${totals.connectionsProcessed}/${connectionIds.length})`,
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
      } else {
        const guestBilling = extractStripeGuestBillingFromBalanceTransaction(tx);
        if (guestBilling) {
          const member = await ensureCommunityMemberForEmail({
            email: guestBilling.email,
            name: guestBilling.name,
            address: guestBilling.address,
            joinedAt: new Date(tx.created * 1000),
          });
          memberLink.communityMemberId = member.communityMemberId;
        }
      }

      if (memberLink.communityMemberId) {
        totals.membersLinked += 1;
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

export async function syncStripeBalanceTransactions(
  options: SyncStripeTransactionsOptions = {},
): Promise<SyncStripeTransactionsResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  const { audit: _audit, ...rest } = options;

  return runIntegrationJob(
    {
      jobType: "stripe_transactions_sync",
      triggeredBy: audit.triggeredBy,
      userId: audit.userId,
      options: {
        connectionId: rest.connectionId,
        days: rest.days,
        since: rest.since?.toISOString(),
      },
    },
    (jobId) => syncStripeBalanceTransactionsInner({ ...rest, audit }, jobId),
  );
}
