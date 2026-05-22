import { useLocation } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.accounts";
import { ActiveBadge, QuickBooksMasterDataPage } from "~/components/quickbooks-master-data-page";
import {
  listQuickBooksAccounts,
  syncQuickBooksAccounts,
} from "~/lib/quickbooks-master-data.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks accounts — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return listQuickBooksAccounts();
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh") {
    return { scope: "refresh" as const, error: "Unknown action" };
  }
  try {
    const result = await syncQuickBooksAccounts();
    return { scope: "refresh" as const, success: true as const, result };
  } catch (err) {
    return {
      scope: "refresh" as const,
      error: err instanceof Error ? err.message : "Refresh failed",
    };
  }
}

export default function QuickBooksAccountsPage({
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
      title="Chart of accounts"
      description="QuickBooks chart of accounts synced into Lotus Ledger for mapping and reporting."
      connected={loaderData.connected}
      companyName={loaderData.companyName}
      lastSyncedAt={loaderData.lastSyncedAt}
      postAction={postAction}
      syncResult={syncResult}
      syncError={syncError}
      count={loaderData.accounts.length}
      countLabel="accounts"
    >
      {loaderData.accounts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No accounts stored yet. Click Refresh from QuickBooks to import.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-surface text-dark">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Sub-type</th>
                <th className="px-4 py-3 font-medium">QB ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
              {loaderData.accounts.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-dark">
                      {row.fullyQualifiedName ?? row.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-muted">
                    {row.accountNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{row.accountType ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.accountSubType ?? "—"}
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
