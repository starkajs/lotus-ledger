import type { ReactNode } from "react";
import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/integrations.woocommerce.products.$productId";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { getWooCommerceSiteUrl } from "~/lib/env.server";
import { listProducts } from "~/lib/products.server";
import { requireUser } from "~/lib/session.server";
import { formatWooCommerceMoneyMinor } from "~/lib/woocommerce-money";
import {
  getWooCommerceProductById,
  setWooCommerceProductLotusLink,
} from "~/lib/woocommerce-products.server";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-sand-dark/30 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="text-sm text-dark break-all">{children}</dd>
    </div>
  );
}

export function meta({ data }: Route.MetaArgs) {
  const name = data?.product.name ?? "Product";
  return [
    { title: `${name} — WooCommerce — Lotus Ledger` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const product = await getWooCommerceProductById(params.productId);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("returnTo") ?? "/integrations/woocommerce/products";

  const catalogProducts = await listProducts();
  const linkedId = product.lotusProduct?.productId;
  const options = catalogProducts.some((p) => p.id === linkedId)
    ? catalogProducts
    : product.lotusProduct
      ? [
          {
            id: product.lotusProduct.productId,
            code: product.lotusProduct.code,
            name: product.lotusProduct.name,
            quickbooksItemId: null,
            isActive: false,
            sortOrder: 0,
            createdAt: "",
            updatedAt: "",
          },
          ...catalogProducts,
        ]
      : catalogProducts;

  const siteUrl = getWooCommerceSiteUrl();
  const wpAdminProductUrl = siteUrl
    ? `${siteUrl}/wp-admin/post.php?post=${product.wcProductId}&action=edit`
    : null;

  return { product, returnTo, catalogProducts: options, wpAdminProductUrl };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const returnTo = String(
    form.get("returnTo") ?? "/integrations/woocommerce/products",
  );

  const detailPath = `/integrations/woocommerce/products/${params.productId}`;
  const redirectUrl = `${detailPath}?returnTo=${encodeURIComponent(returnTo)}`;

  if (intent === "setLotusProduct") {
    const productId = String(form.get("productId") ?? "").trim() || null;
    try {
      await setWooCommerceProductLotusLink(params.productId, productId);
      return redirect(redirectUrl);
    } catch (err) {
      return {
        scope: "lotusProduct" as const,
        error: err instanceof Error ? err.message : "Failed to save link",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function WooCommerceProductDetailPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { product, returnTo, catalogProducts, wpAdminProductUrl } = loaderData;
  const location = useLocation();
  const postAction = location.pathname + location.search;

  return (
    <AppPage
      title={product.name}
      description={`WC product ${product.wcProductId}`}
      actions={
        <Link
          to={returnTo}
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Back to list
        </Link>
      }
    >
      <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Lotus product</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Link this WooCommerce product to a single catalog product for reporting
          and QuickBooks mapping.
        </p>
        {product.lotusProduct ? (
          <p className="mt-2 text-sm text-dark">
            <Link
              to="/products"
              className="font-mono text-teal hover:underline"
            >
              {product.lotusProduct.code}
            </Link>
            <span className="text-ink-muted"> — {product.lotusProduct.name}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Not linked</p>
        )}
        <Form
          method="post"
          action={postAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Lotus product</span>
            <select
              name="productId"
              defaultValue={product.lotusProduct?.productId ?? ""}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[14rem]"
            >
              <option value="">— None —</option>
              {catalogProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                  {!p.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton
            intent="setLotusProduct"
            variant="pill"
            loadingLabel="Saving…"
          >
            Save link
          </SubmitButton>
        </Form>
        {actionData?.scope === "lotusProduct" && actionData.error && (
          <p className="mt-2 text-sm text-maroon" role="alert">
            {actionData.error}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
        <h2 className="text-sm font-medium text-dark">Catalog</h2>
        <dl className="mt-3">
          <DetailRow label="SKU">
            <span className="font-mono text-xs">{product.sku ?? "—"}</span>
          </DetailRow>
          <DetailRow label="Status">
            <span className="capitalize">{product.status}</span>
          </DetailRow>
          <DetailRow label="Type">
            <span className="capitalize">{product.type}</span>
          </DetailRow>
          <DetailRow label="Price">
            <span className="font-mono">
              {formatWooCommerceMoneyMinor(
                product.priceMinor ?? product.regularPriceMinor,
                product.currency,
              )}
            </span>
          </DetailRow>
          <DetailRow label="Stock">
            {product.stockStatus ?? "—"}
            {product.stockQuantity != null && (
              <span className="ml-2 font-mono text-xs text-ink-muted">
                ({product.stockQuantity})
              </span>
            )}
          </DetailRow>
          <DetailRow label="Categories">
            {product.categorySummary ?? "—"}
          </DetailRow>
          {product.permalink && (
            <DetailRow label="Shop">
              <a
                href={product.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-teal hover:underline"
              >
                View in shop
              </a>
            </DetailRow>
          )}
        </dl>
      </div>

      {(product.shortDescription || product.description) && (
        <div className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 sm:px-6">
          <h2 className="text-sm font-medium text-dark">Description</h2>
          {product.shortDescription && (
            <p className="mt-2 text-sm text-dark">{product.shortDescription}</p>
          )}
          {product.description && (
            <p className="mt-2 text-sm text-ink-muted">{product.description}</p>
          )}
        </div>
      )}

      {product.wcRaw && (
        <details className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark sm:px-6">
            Raw WooCommerce API response
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-sand-dark/40 px-4 py-3 text-xs text-ink-muted sm:px-6">
            {JSON.stringify(product.wcRaw, null, 2)}
          </pre>
        </details>
      )}

      {wpAdminProductUrl && (
        <p className="mt-4 text-sm text-ink-muted">
          <a
            href={wpAdminProductUrl}
            target="_blank"
            rel="noreferrer"
            className="text-teal underline-offset-2 hover:underline"
          >
            Open in WordPress admin
          </a>
        </p>
      )}
    </AppPage>
  );
}
