import { Link } from "react-router";
import type { Route } from "./+types/integrations.woocommerce";
import { AppPage } from "~/components/app-page";
import { getWooCommerceSiteUrl, isWooCommerceConfigured } from "~/lib/env.server";
import { countWooCommerceOrders } from "~/lib/woocommerce-orders.server";
import { verifyWooCommerceConnection } from "~/lib/woocommerce-api.server";
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

  return {
    configured,
    siteUrl,
    verifyOk: verify.ok,
    verifyError: verify.error ?? null,
    orderCount,
  };
}

export default function WooCommerceIntegrationPage({
  loaderData,
}: Route.ComponentProps) {
  const { configured, siteUrl, verifyOk, verifyError, orderCount } = loaderData;

  return (
    <AppPage
      title="WooCommerce"
      description="Orders from your WordPress shop via the WooCommerce REST API."
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
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/integrations/woocommerce/orders"
              className="rounded-jamyang-pill bg-maroon px-4 py-2 text-sm font-medium text-surface-overlay hover:bg-maroon-dark"
            >
              View orders
            </Link>
          </div>

          <p className="mt-6 text-xs text-ink-muted">
            Sync from the orders page or run{" "}
            <code className="font-mono">npm run sync:woocommerce-orders</code>.
            Billing email is matched to community members (created if missing).
          </p>
        </>
      )}
    </AppPage>
  );
}
