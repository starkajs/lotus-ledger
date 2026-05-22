import type { Route } from "./+types/api.quickbooks.invoices";
import { isQuickBooksConfigured } from "~/lib/env.server";
import {
  fetchQuickBooksInvoices,
  verifyQuickBooksConnection,
} from "~/lib/quickbooks-api.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);

  if (!isQuickBooksConfigured()) {
    return Response.json(
      { ok: false, error: "QuickBooks app credentials are not configured" },
      { status: 503 },
    );
  }

  if (!(await getQuickBooksTokens())) {
    return Response.json(
      { ok: false, error: "QuickBooks is not connected" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);

  try {
    const connection = await verifyQuickBooksConnection();
    if (!connection.ok) {
      return Response.json(
        { ok: false, error: connection.error ?? "QuickBooks connection failed" },
        { status: 502 },
      );
    }

    const invoices = await fetchQuickBooksInvoices(limit);

    return Response.json({
      ok: true,
      connection,
      invoices,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch QuickBooks invoices";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export default function QuickBooksInvoicesApi() {
  return null;
}
