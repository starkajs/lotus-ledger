import { Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.items";
import { ActiveBadge, QuickBooksMasterDataPage } from "~/components/quickbooks-master-data-page";
import {
  listQuickBooksItems,
  syncQuickBooksItems,
} from "~/lib/quickbooks-master-data.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks products & services — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return listQuickBooksItems();
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh") {
    return { scope: "refresh" as const, error: "Unknown action" };
  }
  try {
    const result = await syncQuickBooksItems();
    return { scope: "refresh" as const, success: true as const, result };
  } catch (err) {
    return {
      scope: "refresh" as const,
      error: err instanceof Error ? err.message : "Refresh failed",
    };
  }
}

export default function QuickBooksItemsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const syncResult =
    actionData?.scope === "refresh" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "refresh" && actionData.error ? actionData.error : null;

  return (
    <QuickBooksMasterDataPage
      title="Products & services"
      description={
        <>
          QuickBooks Items (Service, Non-inventory, Inventory) synced for mapping to{" "}
          <Link to="/products" className="text-teal underline-offset-2 hover:underline">
            Lotus products
          </Link>
          .
        </>
      }
      connected={loaderData.connected}
      companyName={loaderData.companyName}
      lastSyncedAt={loaderData.lastSyncedAt}
      postAction={postAction}
      syncResult={syncResult}
      syncError={syncError}
      count={loaderData.items.length}
      countLabel="items"
    >
      {loaderData.items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No items stored yet. Click Refresh from QuickBooks to import.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-surface text-dark">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Income account</th>
                <th className="px-4 py-3 font-medium">QB ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
              {loaderData.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-dark">{row.name}</span>
                    {row.description ? (
                      <p className="mt-0.5 text-xs text-ink-muted line-clamp-2">
                        {row.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{row.itemType}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.sku ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink-muted">
                    {row.unitPrice ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                    {row.incomeAccountRef ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                    {row.quickbooksId}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={row.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QuickBooksMasterDataPage>
  );
}
