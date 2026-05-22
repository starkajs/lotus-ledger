import { redirect } from "react-router";
import type { Route } from "./+types/integrations.invite";

export function loader({}: Route.LoaderArgs) {
  throw redirect("/users");
}

export default function InviteRedirect() {
  return null;
}
