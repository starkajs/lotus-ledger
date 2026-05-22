import Stripe from "stripe";
import { requireStripeSecretKey } from "./env.server";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeSecretKey());
  }
  return stripeClient;
}

export function resetStripeClient(): void {
  stripeClient = null;
}
