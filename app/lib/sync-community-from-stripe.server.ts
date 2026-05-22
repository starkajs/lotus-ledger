import type Stripe from "stripe";
import {
  getStripeClientForConnection,
  getStripeConnectionById,
  listStripeConnections,
} from "./stripe-connections.server";
import { normalizeCountryCode } from "~/lib/country-code.server";
import {
  upsertCommunityMemberFromStripe,
  type CommunityMemberAddress,
  type UpsertCommunityMemberFromStripeResult,
} from "./community-members.server";

function parseStripeAddress(
  address: Stripe.Customer["address"],
): CommunityMemberAddress | null {
  if (!address) return null;

  const countryCode = normalizeCountryCode(address.country);
  const addressLine1 = address.line1?.trim() || null;
  const addressLine2 = address.line2?.trim() || null;
  const city = address.city?.trim() || null;
  const state = address.state?.trim() || null;
  const postalCode = address.postal_code?.trim() || null;

  if (!countryCode && !addressLine1 && !city) return null;

  return {
    countryCode,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
  };
}

export type SyncCommunityFromStripeOptions = {
  /** Sync one Stripe connection only (DB uuid). Omit to sync all saved connections. */
  connectionId?: string;
};

export type SyncCommunityFromStripeResult = {
  connectionsProcessed: number;
  membersCreated: number;
  linksCreated: number;
  linksUpdated: number;
  skippedNoEmail: number;
  conflicts: Array<{
    stripeCustomerId: string;
    email: string | null;
    reason: string;
  }>;
};

async function* iterateStripeCustomers(
  stripe: Stripe,
): AsyncGenerator<Stripe.Customer> {
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.customers.list({
      limit: 100,
      starting_after: startingAfter,
    });

    for (const customer of page.data) {
      if (!customer.deleted) {
        yield customer;
      }
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

function applyUpsertResult(
  result: UpsertCommunityMemberFromStripeResult,
  totals: SyncCommunityFromStripeResult,
  customer: Stripe.Customer,
  seenNewMembers: Set<string>,
) {
  if (result.status === "conflict") {
    totals.conflicts.push({
      stripeCustomerId: customer.id,
      email: customer.email,
      reason: result.reason,
    });
    return;
  }

  if (result.status === "created") {
    if (!seenNewMembers.has(result.memberId)) {
      totals.membersCreated += 1;
      seenNewMembers.add(result.memberId);
    }
    totals.linksCreated += 1;
    return;
  }

  totals.linksUpdated += 1;
}

export async function syncCommunityMembersFromStripe(
  options: SyncCommunityFromStripeOptions = {},
): Promise<SyncCommunityFromStripeResult> {
  const totals: SyncCommunityFromStripeResult = {
    connectionsProcessed: 0,
    membersCreated: 0,
    linksCreated: 0,
    linksUpdated: 0,
    skippedNoEmail: 0,
    conflicts: [],
  };

  const connectionIds: Array<{ id: string; label: string }> = [];
  const seenNewMembers = new Set<string>();

  if (options.connectionId) {
    const row = await getStripeConnectionById(options.connectionId);
    if (!row) {
      throw new Error(`Stripe connection not found: ${options.connectionId}`);
    }
    connectionIds.push({ id: row.id, label: row.label });
  } else {
    const connections = await listStripeConnections();
    if (connections.length === 0) {
      throw new Error(
        "No Stripe connections in the database. Add one at /integrations/stripe first.",
      );
    }
    connectionIds.push(
      ...connections.map((c) => ({ id: c.id, label: c.label })),
    );
  }

  for (const connection of connectionIds) {
    totals.connectionsProcessed += 1;
    const stripe = await getStripeClientForConnection(connection.id);

    for await (const customer of iterateStripeCustomers(stripe)) {
      const email = customer.email?.trim().toLowerCase();
      if (!email) {
        totals.skippedNoEmail += 1;
        continue;
      }

      const result = await upsertCommunityMemberFromStripe({
        email,
        stripeCustomerId: customer.id,
        name: customer.name ?? customer.metadata?.name ?? null,
        stripeConnectionId: connection.id,
        address: parseStripeAddress(customer.address),
        stripeCustomerCreatedAt: new Date(customer.created * 1000),
      });

      applyUpsertResult(result, totals, customer, seenNewMembers);
    }
  }

  return totals;
}
