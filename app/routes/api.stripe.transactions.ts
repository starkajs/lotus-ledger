import type { Route } from "./+types/api.stripe.transactions";
import { getStripeSecretKey } from "~/lib/env.server";
import {
  fetchStripeTransactions,
  verifyStripeConnection,
} from "~/lib/stripe-transactions.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (!getStripeSecretKey()) {
    return Response.json(
      { ok: false, error: "STRIPE_SECRET_KEY is not configured" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);
  const startingAfter = url.searchParams.get("starting_after") ?? undefined;

  try {
    const connection = await verifyStripeConnection();
    if (!connection.ok) {
      return Response.json(
        { ok: false, error: connection.error ?? "Stripe connection failed" },
        { status: 502 },
      );
    }

    const transactions = await fetchStripeTransactions({ limit, startingAfter });

    return Response.json({
      ok: true,
      connection,
      ...transactions,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Stripe transactions";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export default function StripeTransactionsApi() {
  return null;
}
