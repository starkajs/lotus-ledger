import type { Route } from "./+types/api.stripe.transactions";
import {
  listStripeConnections,
  verifyStoredStripeConnection,
} from "~/lib/stripe-connections.server";
import { fetchStripeTransactions } from "~/lib/stripe-transactions.server";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);
  const startingAfter = url.searchParams.get("starting_after") ?? undefined;

  if (!accountId) {
    const connections = await listStripeConnections();
    return Response.json(
      {
        ok: false,
        error: "Missing account query parameter",
        accounts: connections.map((c) => ({
          id: c.id,
          label: c.label,
          keyLast4: c.keyLast4,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const connection = await verifyStoredStripeConnection(accountId);
    if (!connection.ok) {
      return Response.json(
        { ok: false, error: connection.error ?? "Stripe connection failed" },
        { status: 502 },
      );
    }

    const transactions = await fetchStripeTransactions({
      connectionId: accountId,
      limit,
      startingAfter,
    });

    return Response.json({
      ok: true,
      accountId,
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
