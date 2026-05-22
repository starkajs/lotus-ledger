import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { LandingPage } from "../components/landing-page";
import { getUserFromRequest } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (user) throw redirect("/home");
  return null;
}

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
