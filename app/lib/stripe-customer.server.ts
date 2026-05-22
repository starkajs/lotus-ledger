import type Stripe from "stripe";
import { normalizeCountryCode } from "~/lib/country-code";
import type { CommunityMemberAddress } from "~/lib/community-members.server";
import {
  extractStripeGuestBillingFromStripeRaw,
  type StripeGuestBillingInfo,
} from "~/lib/stripe-transaction-signals";

export type { StripeGuestBillingInfo } from "~/lib/stripe-transaction-signals";

export function parseStripeCustomerAddress(
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

export function stripeCustomerToMemberInput(
  connectionId: string,
  customer: Stripe.Customer,
) {
  return {
    email: customer.email!,
    stripeCustomerId: customer.id,
    stripeConnectionId: connectionId,
    name: customer.name ?? customer.metadata?.name ?? null,
    address: parseStripeCustomerAddress(customer.address),
    stripeCustomerCreatedAt: new Date(customer.created * 1000),
  };
}

/** Extract `cus_…` from an expanded balance transaction source. */
export function extractStripeCustomerIdFromBalanceTransaction(
  tx: Stripe.BalanceTransaction,
): string | null {
  const source = tx.source;
  if (!source || typeof source === "string") {
    return null;
  }

  const withCustomer = source as { customer?: string | { id?: string } | null };
  if (!withCustomer.customer) {
    return null;
  }

  return typeof withCustomer.customer === "string"
    ? withCustomer.customer
    : (withCustomer.customer.id ?? null);
}

/**
 * Billing / Donorbox email when there is no Stripe Customer (`cus_…`).
 */
export function extractStripeGuestBillingFromBalanceTransaction(
  tx: Stripe.BalanceTransaction,
): StripeGuestBillingInfo | null {
  const raw = JSON.parse(JSON.stringify(tx)) as Record<string, unknown>;
  return extractStripeGuestBillingFromStripeRaw(raw);
}
