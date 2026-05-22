import type { Route } from "./+types/app.home";
import { AppPage } from "~/components/app-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Home — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export default function AppHome() {
  return (
    <AppPage
      title="Home"
      description="Dashboard content will appear here."
    />
  );
}
