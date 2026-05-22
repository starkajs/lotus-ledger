import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.products";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { WooCommerceProductsTable } from "~/components/woocommerce-products-table";
import { listProducts } from "~/lib/products.server";
import { requireUser } from "~/lib/session.server";
import {
  bulkSetWooCommerceProductLotusLinks,
  listDistinctWooCommerceProductStatuses,
  listWooCommerceProductsFromDb,
  syncWooCommerceProductsFromApi,
} from "~/lib/woocommerce-products.server";

type LotusLinkFilter = "all" | "linked" | "unlinked";

function parseLotusLinkFilter(value: string | null): LotusLinkFilter {
  if (value === "yes") return "linked";
  if (value === "no") return "unlinked";
  return "all";
}

function lotusLinkParam(filter: LotusLinkFilter): string | null {
  if (filter === "linked") return "yes";
  if (filter === "unlinked") return "no";
  return null;
}

function pageHref(
  page: number,
  q: string,
  status: string,
  lotusLink: LotusLinkFilter,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  const mapped = lotusLinkParam(lotusLink);
  if (mapped) params.set("mapped", mapped);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WooCommerce products — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const statusRaw = url.searchParams.get("status")?.trim() ?? "all";
  const lotusLink = parseLotusLinkFilter(url.searchParams.get("mapped"));

  const [list, statuses, catalogProducts] = await Promise.all([
    listWooCommerceProductsFromDb({
      page,
      q,
      status: statusRaw,
      lotusLink,
    }),
    listDistinctWooCommerceProductStatuses(),
    listProducts(),
  ]);

  const status =
    statuses.includes(statusRaw) || statusRaw === "all" ? statusRaw : "all";

  const bulkAssigned = url.searchParams.get("bulkAssigned");

  return {
    ...list,
    q,
    status,
    statuses,
    lotusLink,
    catalogProducts,
    bulkAssigned,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const url = new URL(request.url);

  if (intent === "sync") {
    try {
      const result = await syncWooCommerceProductsFromApi();
      return { scope: "sync" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "sync" as const,
        error: err instanceof Error ? err.message : "Sync failed",
      };
    }
  }

  if (intent === "bulkAssignLotusProduct") {
    const wcProductIds = form
      .getAll("wcProductIds")
      .map((value) => String(value));
    const productId = String(form.get("productId") ?? "").trim() || null;
    try {
      const result = await bulkSetWooCommerceProductLotusLinks(
        wcProductIds,
        productId,
      );
      const params = new URLSearchParams(url.searchParams);
      params.set(
        "bulkAssigned",
        productId ? String(result.updated) : `cleared-${result.updated}`,
      );
      const query = params.toString();
      return redirect(query ? `${url.pathname}?${query}` : url.pathname);
    } catch (err) {
      return {
        scope: "bulkAssign" as const,
        error: err instanceof Error ? err.message : "Bulk assign failed",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function WooCommerceProductsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const location = useLocation();
  const postAction = location.pathname + location.search;
  const {
    configured,
    siteUrl,
    products,
    total,
    page,
    pageSize,
    totalPages,
    lastSyncedAt,
    q,
    status,
    statuses,
    lotusLink,
    catalogProducts,
    bulkAssigned,
  } = loaderData;

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;
  const bulkAssignError =
    actionData?.scope === "bulkAssign" && actionData.error
      ? actionData.error
      : null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const listReturnTo = location.pathname + location.search;

  return (
    <AppPage
      title="WooCommerce products"
      description={
        configured && siteUrl
          ? `Product catalog from ${siteUrl}. Last sync: ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("en-GB") : "never"}.`
          : "Configure WC_* env vars to connect your shop."
      }
      actions={
        configured ? (
          <Form method="post" action={postAction}>
            <SubmitButton intent="sync" variant="pill" loadingLabel="Syncing…">
              Sync from WooCommerce
            </SubmitButton>
          </Form>
        ) : (
          <Link
            to="/integrations/woocommerce"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Setup
          </Link>
        )
      }
    >
      {!configured ? (
        <p className="text-sm text-maroon">
          WooCommerce is not configured. See{" "}
          <Link to="/integrations/woocommerce" className="text-teal underline">
            integration settings
          </Link>
          .
        </p>
      ) : (
        <>
          {syncError && (
            <p className="mb-3 text-sm text-maroon" role="alert">
              {syncError}
            </p>
          )}
          {syncResult && (
            <p className="mb-3 text-sm text-jade">
              Sync complete: {syncResult.created} created, {syncResult.updated}{" "}
              updated.
            </p>
          )}
          {bulkAssignError && (
            <p className="mb-3 text-sm text-maroon" role="alert">
              {bulkAssignError}
            </p>
          )}
          {bulkAssigned && (
            <p className="mb-3 text-sm text-jade">
              {(() => {
                const cleared = bulkAssigned.startsWith("cleared-");
                const count = Number(
                  cleared ? bulkAssigned.slice("cleared-".length) : bulkAssigned,
                );
                const label = count === 1 ? "product" : "products";
                return cleared
                  ? `Cleared Lotus link on ${count} ${label}.`
                  : `Assigned Lotus product to ${count} ${label}.`;
              })()}
            </p>
          )}

          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Search</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, SKU, slug"
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[12rem]"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Status</span>
              <select
                name="status"
                defaultValue={status}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-muted">Lotus product</span>
              <select
                name="mapped"
                defaultValue={lotusLinkParam(lotusLink) ?? ""}
                className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[10rem]"
              >
                <option value="">All</option>
                <option value="yes">Linked</option>
                <option value="no">Not linked</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
            >
              Apply
            </button>
          </form>

          <p className="mt-3 text-xs text-ink-muted">
            {total === 0
              ? lotusLink === "linked"
                ? "No products linked to a Lotus product."
                : lotusLink === "unlinked"
                  ? "No unlinked products — everything has a Lotus product."
                  : "No products synced yet."
              : `${total} product${total === 1 ? "" : "s"}`}
            {lotusLink === "linked" && total > 0 && (
              <span className="text-ink-faint"> · linked only</span>
            )}
            {lotusLink === "unlinked" && total > 0 && (
              <span className="text-ink-faint"> · not linked only</span>
            )}
            {total > 0 && (
              <span className="text-ink-faint">
                {" "}
                · {rangeStart}–{rangeEnd}
              </span>
            )}
          </p>

          {products.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">
              {lotusLink === "unlinked"
                ? "All products are linked, or try clearing filters."
                : lotusLink === "linked"
                  ? "Clear the filter or link products on their detail pages."
                  : "Use Sync from WooCommerce to import your catalog."}
            </p>
          ) : (
            <>
              <WooCommerceProductsTable
                products={products}
                catalogProducts={catalogProducts}
                listReturnTo={listReturnTo}
                postAction={postAction}
              />

              {totalPages > 1 && (
                <nav
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  aria-label="Products pagination"
                >
                  <p className="text-ink-muted">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <Link
                        to={pageHref(page - 1, q, status, lotusLink)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Previous
                      </Link>
                    ) : null}
                    {page < totalPages ? (
                      <Link
                        to={pageHref(page + 1, q, status, lotusLink)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Next
                      </Link>
                    ) : null}
                  </div>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </AppPage>
  );
}
