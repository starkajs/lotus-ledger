import { Link } from "react-router";
import type { Route } from "./+types/reconciliations";
import { AppPage } from "~/components/app-page";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Reconciliations — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return {};
}

const reconciliations = [
  {
    to: "/reconciliations/wc-stripe",
    title: "WooCommerce ↔ Stripe",
    description:
      "Compare synced WC orders and Stripe balance transactions in a date range. See matched pairs, unmatched orders by status, and unmatched Stripe by Lotus product.",
  },
] as const;

export default function ReconciliationsPage({}: Route.ComponentProps) {
  return (
    <AppPage
      title="Reconciliations"
      description="Cross-check integration data for a chosen period."
    >
      <ul className="mt-4 divide-y divide-sand-dark/40 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay">
        {reconciliations.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block px-4 py-4 sm:px-6 hover:bg-surface/80"
            >
              <span className="text-sm font-medium text-teal">{item.title}</span>
              <p className="mt-1 text-xs text-ink-muted">{item.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AppPage>
  );
}
