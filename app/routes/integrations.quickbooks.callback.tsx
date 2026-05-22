import { redirect } from "react-router";
import type { Route } from "./+types/integrations.quickbooks.callback";
import { getCookie } from "~/lib/http.server";
import {
  clearQuickBooksOAuthStateCookie,
  completeQuickBooksOAuth,
  verifyOAuthState,
} from "~/lib/quickbooks-oauth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const message = errorDescription ?? error;
    return redirect(
      `/integrations/quickbooks?error=${encodeURIComponent(message)}`,
      { headers: { "Set-Cookie": clearQuickBooksOAuthStateCookie() } },
    );
  }

  const state = url.searchParams.get("state");
  const cookieState = getCookie(request, "quickbooks_oauth_state");

  if (!verifyOAuthState(state) || state !== cookieState) {
    return redirect("/integrations/quickbooks?error=Invalid+OAuth+state", {
      headers: { "Set-Cookie": clearQuickBooksOAuthStateCookie() },
    });
  }

  try {
    await completeQuickBooksOAuth(request.url);
    return redirect("/integrations/quickbooks?connected=1", {
      headers: { "Set-Cookie": clearQuickBooksOAuthStateCookie() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return redirect(
      `/integrations/quickbooks?error=${encodeURIComponent(message)}`,
      { headers: { "Set-Cookie": clearQuickBooksOAuthStateCookie() } },
    );
  }
}

export default function QuickBooksCallback() {
  return null;
}
