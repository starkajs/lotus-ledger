import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import {
  clearSessionCookie,
  destroyUserSession,
  getUserFromRequest,
} from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  await destroyUserSession(request, { recordLogout: true, user });
  throw redirect("/", {
    headers: { "Set-Cookie": clearSessionCookie() },
  });
}

export default function Logout() {
  return null;
}
