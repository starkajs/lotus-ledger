import { Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.tax-codes";
import {
  ActiveBadge,
  QuickBooksMasterDataPage,
} from "~/components/quickbooks-master-data-page";
import {
  listQuickBooksTaxCodes,
  syncQuickBooksTaxCodes,
} from "~/lib/quickbooks-master-data.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "QuickBooks VAT codes — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return listQuickBooksTaxCodes();
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh") {
    return { scope: "refresh" as const, error: "Unknown action" };
  }
  try {
    const result = await syncQuickBooksTaxCodes({
      triggeredBy: "app",
      userId: user.id,
    });
    return { scope: "refresh" as const, success: true as const, result };
  } catch (err) {
    return {
      scope: "refresh" as const,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

export default function QuickBooksTaxCodesPage({
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
      title="VAT codes"
      description={
        <>
          Tax codes synced from QuickBooks. Assign them on{" "}
          <Link to="/products" className="text-teal underline">
            Lotus products
          </Link>{" "}
          for Stripe → QuickBooks Sales Receipt pushes. Item sync also imports tax
          codes; use Refresh here to update the list only.
        </>
      }
      connected={loaderData.connected}
      companyName={loaderData.companyName}
      lastSyncedAt={loaderData.lastSyncedAt}
      postAction={postAction}
      syncResult={syncResult}
      syncError={syncError}
      count={loaderData.taxCodes.length}
      countLabel="VAT codes"
    >
      {loaderData.taxCodes.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No VAT codes stored yet. Click Refresh from QuickBooks to import.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface text-dark">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">QB ID</th>
                <th className="px-4 py-3 font-medium">Taxable</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
              {loaderData.taxCodes.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-dark">{row.name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                    {row.quickbooksId}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.taxable == null ? "—" : row.taxable ? "Yes" : "No"}
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
