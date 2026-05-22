import { Form, Link, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.products";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  listDistinctWooCommerceProductStatuses,
  listWooCommerceProductsFromDb,
  syncWooCommerceProductsFromApi,
} from "~/lib/woocommerce-products.server";
import { requireUser } from "~/lib/session.server";

function productDetailHref(productId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/products/${productId}?${params}`;
}

function pageHref(
  page: number,
  q: string,
  status: string,
  mappedOnly: boolean,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (mappedOnly) params.set("mapped", "yes");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function StatusBadge({ status }: { status: string }) {
  const published = status === "publish";
  return (
    <span
      className={
        published
          ? "inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium capitalize text-jade"
          : "inline-flex rounded bg-sand/80 px-1.5 py-0.5 text-[10px] font-medium capitalize text-ink-muted"
      }
    >
      {status}
    </span>
  );
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
  const mappedOnly = url.searchParams.get("mapped") === "yes";

  const [list, statuses] = await Promise.all([
    listWooCommerceProductsFromDb({
      page,
      q,
      status: statusRaw,
      mappedOnly,
    }),
    listDistinctWooCommerceProductStatuses(),
  ]);

  const status =
    statuses.includes(statusRaw) || statusRaw === "all" ? statusRaw : "all";

  return { ...list, q, status, statuses, mappedOnly };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "sync") {
    return { scope: "sync" as const, error: "Unknown action" };
  }
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
    mappedOnly,
  } = loaderData;

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;

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
            <label className="flex items-center gap-2 pb-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                name="mapped"
                value="yes"
                defaultChecked={mappedOnly}
                className="rounded border-sand-dark/60"
              />
              Linked to Lotus product
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
              ? mappedOnly
                ? "No products linked to a Lotus product."
                : "No products synced yet."
              : `${total} product${total === 1 ? "" : "s"}`}
            {mappedOnly && total > 0 && (
              <span className="text-ink-faint"> · linked to Lotus only</span>
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
              {mappedOnly
                ? "Clear the filter or link products on their detail pages."
                : "Use Sync from WooCommerce to import your catalog."}
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
                <table className="w-full min-w-[48rem] text-left text-xs">
                  <thead className="bg-surface text-dark">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">SKU</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium text-right">Price</th>
                      <th className="px-2 py-1.5 font-medium">Stock</th>
                      <th className="px-2 py-1.5 font-medium">Categories</th>
                      <th className="px-2 py-1.5 font-medium">Lotus product</th>
                      <th className="px-2 py-1.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-overlay">
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        className="border-b border-sand-dark/30 align-top hover:bg-sand/20"
                      >
                        <td className="px-2 py-1.5">
                          <Link
                            to={productDetailHref(product.id, listReturnTo)}
                            className="font-medium text-teal hover:underline"
                          >
                            {product.name}
                          </Link>
                          {product.slug && (
                            <div className="font-mono text-[10px] text-ink-faint">
                              {product.slug}
                            </div>
                          )}
                          {product.permalink && (
                            <a
                              href={product.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-teal hover:underline"
                            >
                              View in shop
                            </a>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">
                          {product.sku ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 capitalize text-ink-muted">
                          {product.type}
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusBadge status={product.status} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                          {formatWooCommerceMoneyMinor(
                            product.priceMinor ?? product.regularPriceMinor,
                            product.currency,
                          )}
                          {product.onSale && product.salePriceMinor != null && (
                            <span className="block text-[10px] text-jade">
                              Sale{" "}
                              {formatWooCommerceMoneyMinor(
                                product.salePriceMinor,
                                product.currency,
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-ink-muted">
                          {product.stockStatus ?? "—"}
                          {product.stockQuantity != null && (
                            <span className="block font-mono text-[10px]">
                              {product.stockQuantity}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-ink-muted max-w-[12rem]">
                          {product.categorySummary ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {product.lotusProduct ? (
                            <Link
                              to={productDetailHref(product.id, listReturnTo)}
                              className="font-mono text-[10px] text-teal hover:underline"
                              title={product.lotusProduct.name}
                            >
                              {product.lotusProduct.code}
                            </Link>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Link
                            to={productDetailHref(product.id, listReturnTo)}
                            className="inline-flex rounded border border-sand-dark/50 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-surface"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                        to={pageHref(page - 1, q, status, mappedOnly)}
                        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                      >
                        Previous
                      </Link>
                    ) : null}
                    {page < totalPages ? (
                      <Link
                        to={pageHref(page + 1, q, status, mappedOnly)}
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
