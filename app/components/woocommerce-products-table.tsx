import { useMemo, useState } from "react";
import { Form, Link } from "react-router";
import { SubmitButton } from "~/components/submit-button";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import type { ProductRecord } from "~/lib/products.server";
import type { WooCommerceProductRecord } from "~/lib/woocommerce-products.server";

function productDetailHref(productId: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/integrations/woocommerce/products/${productId}?${params}`;
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

export function WooCommerceProductsTable({
  products,
  catalogProducts,
  listReturnTo,
  postAction,
}: {
  products: WooCommerceProductRecord[];
  catalogProducts: ProductRecord[];
  listReturnTo: string;
  postAction: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const allOnPageSelected =
    productIds.length > 0 && productIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      if (allOnPageSelected) return new Set();
      return new Set(productIds);
    });
  }

  return (
    <>
      <Form
        method="post"
        action={postAction}
        className="mt-3 flex flex-wrap items-end gap-3 rounded-jamyang border border-sand-dark/50 bg-surface px-3 py-3"
      >
        <p className="w-full text-xs text-ink-muted">
          {someSelected
            ? `${selected.size} product${selected.size === 1 ? "" : "s"} selected on this page`
            : "Select products below to assign a Lotus product in bulk"}
        </p>
        {productIds.map((id) =>
          selected.has(id) ? (
            <input key={id} type="hidden" name="wcProductIds" value={id} />
          ) : null,
        )}
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">Lotus product</span>
          <select
            name="productId"
            className="rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-2 py-1.5 text-sm min-w-[14rem]"
            defaultValue=""
          >
            <option value="">— Clear link —</option>
            {catalogProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
                {!p.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton
          intent="bulkAssignLotusProduct"
          variant="pill"
          disabled={!someSelected}
          loadingLabel="Assigning…"
        >
          Assign to selected
        </SubmitButton>
      </Form>

      <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
        <table className="w-full min-w-[52rem] text-left text-xs">
          <thead className="bg-surface text-dark">
            <tr>
              <th className="w-8 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select all on this page"
                  className="rounded border-sand-dark/60"
                />
              </th>
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
            {products.map((product) => {
              const isSelected = selected.has(product.id);
              return (
                <tr
                  key={product.id}
                  className={
                    isSelected
                      ? "border-b border-sand-dark/30 align-top bg-teal/5 hover:bg-teal/10"
                      : "border-b border-sand-dark/30 align-top hover:bg-sand/20"
                  }
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(product.id)}
                      aria-label={`Select ${product.name}`}
                      className="rounded border-sand-dark/60"
                    />
                  </td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
