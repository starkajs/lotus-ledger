import { redirect } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.connect";
import { isQuickBooksConfigured } from "~/lib/env.server";
import {
  buildQuickBooksAuthorizeUrl,
  createOAuthState,
  getQuickBooksOAuthStateCookie,
} from "~/lib/quickbooks-oauth.server";

export async function loader({}: Route.LoaderArgs) {
  if (!isQuickBooksConfigured()) {
    throw new Response("QuickBooks app credentials are not configured", {
      status: 503,
    });
  }

  const state = createOAuthState();
  const url = buildQuickBooksAuthorizeUrl(state);

  return redirect(url, {
    headers: {
      "Set-Cookie": getQuickBooksOAuthStateCookie(state),
    },
  });
}

export default function QuickBooksConnectRedirect() {
  return null;
}
