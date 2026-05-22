import type { Route } from "./+types/home";
import { LandingPage } from "../components/landing-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Lotus Ledger — Analytics integration platform" },
    {
      name: "description",
      content:
        "Connect Stripe, QuickBooks, and WooCommerce for unified financial and commerce analytics.",
    },
  ];
}

export default function Home() {
  return <LandingPage />;
}
