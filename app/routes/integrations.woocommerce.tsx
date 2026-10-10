import { Form, Link } from "react-router";
import type { Route } from "./+types/integrations.woocommerce";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { getWooCommerceSiteUrl, isWooCommerceConfigured } from "~/lib/env.server";
import { countWooCommerceOrders } from "~/lib/woocommerce-orders.server";
import { countWooCommerceProducts } from "~/lib/woocommerce-products.server";
import { verifyWooCommerceConnection } from "~/lib/woocommerce-api.server";
import { refreshAllWooCommerce } from "~/lib/woocommerce-refresh-all.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WooCommerce — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const configured = isWooCommerceConfigured();
  const siteUrl = getWooCommerceSiteUrl() ?? null;
  const verify = configured ? await verifyWooCommerceConnection() : { ok: false };
  const orderCount = configured ? await countWooCommerceOrders() : 0;
  const productCount = configured ? await countWooCommerceProducts() : 0;

  return {
    configured,
    siteUrl,
    verifyOk: verify.ok,
    verifyError: verify.error ?? null,
    orderCount,
    productCount,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh-all") {
    return { scope: "refresh-all" as const, error: "Unknown action" };
  }
  if (!isWooCommerceConfigured()) {
    return {
      scope: "refresh-all" as const,
      error: "WooCommerce is not configured.",
    };
  }
  const steps = await refreshAllWooCommerce({
    triggeredBy: "app",
    userId: user.id,
  });
  return { scope: "refresh-all" as const, steps };
}

export default function WooCommerceIntegrationPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { configured, siteUrl, verifyOk, verifyError, orderCount, productCount } =
    loaderData;

  return (
    <AppPage
      title="WooCommerce"
      description="Orders and products from your WordPress shop via the WooCommerce REST API."
    >
      {!configured ? (
        <div
          role="alert"
          className="rounded-jamyang-lg border border-maroon/30 bg-maroon/5 p-6 text-sm"
        >
          <p className="font-medium text-maroon">Not configured</p>
          <p className="mt-2 text-ink-muted">
            Add <code className="font-mono text-xs">WC_SITE</code>,{" "}
            <code className="font-mono text-xs">WC_CONSUMER_KEY</code>, and{" "}
            <code className="font-mono text-xs">WC_CONSUMER_SECRET</code> to{" "}
            <code className="font-mono text-xs">.env</code> (see{" "}
            <code className="font-mono text-xs">.env.example</code>).
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-4 text-sm">
            <p className="text-dark">
              Site:{" "}
              <a
                href={siteUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-teal hover:underline"
              >
                {siteUrl}
              </a>
            </p>
            <p className="mt-2 text-ink-muted">
              API:{" "}
              {verifyOk ? (
                <span className="text-jade">Connected</span>
              ) : (
                <span className="text-maroon">
                  {verifyError ?? "Connection check failed"}
                </span>
              )}
            </p>
            <p className="mt-2 text-ink-muted">
              Orders in Lotus Ledger:{" "}
              <span className="font-medium text-dark">{orderCount}</span>
            </p>
            <p className="mt-2 text-ink-muted">
              Products in Lotus Ledger:{" "}
              <span className="font-medium text-dark">{productCount}</span>
            </p>
          </div>

          <section className="mt-4 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl">WooCommerce data</h2>
                <p className="mt-2 max-w-xl text-sm text-ink-muted">
                  Refresh all pulls orders and the product catalog. Orders
                  cover the last 30 days, or from the newest order already
                  stored when that is older.
                </p>
              </div>
              <Form method="post">
                <SubmitButton
                  intent="refresh-all"
                  variant="pill"
                  loadingLabel="Refreshing all…"
                >
                  Refresh all
                </SubmitButton>
              </Form>
            </div>
            {actionData?.scope === "refresh-all" && actionData.error ? (
              <p
                role="alert"
                className="mt-4 rounded-jamyang border border-maroon/30 bg-maroon/5 px-4 py-3 text-sm text-maroon"
              >
                {actionData.error}
              </p>
            ) : null}
            {actionData?.scope === "refresh-all" && actionData.steps ? (
              <ul
                role="status"
                className="mt-4 space-y-1 rounded-jamyang border border-sand-dark/40 bg-surface px-4 py-3 text-sm"
              >
                {actionData.steps.map((step) => (
                  <li
                    key={step.key}
                    className={step.ok ? "text-dark" : "text-maroon"}
                  >
                    <span className="font-medium">{step.label}:</span>{" "}
                    {step.ok ? step.detail : step.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/integrations/woocommerce/orders"
              className="rounded-jamyang-pill bg-maroon px-4 py-2 text-sm font-medium text-surface-overlay hover:bg-maroon-dark"
            >
              View orders
            </Link>
            <Link
              to="/integrations/woocommerce/products"
              className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm font-medium text-dark hover:bg-surface"
            >
              View products
            </Link>
          </div>

          <p className="mt-6 text-xs text-ink-muted">
            Order billing email finds or creates a community member
            automatically. The orders and products pages still have their own
            sync buttons.
          </p>
        </>
      )}
    </AppPage>
  );
}
