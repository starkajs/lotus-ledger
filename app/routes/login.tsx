import { Form, Link, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { recordLoginEvent } from "~/lib/auth-audit.server";
import { getClientIp, getUserAgent } from "~/lib/http.server";
import { verifyPassword } from "~/lib/password.server";
import {
  createSessionCookie,
  createUserSession,
  redirectIfAuthenticated,
} from "~/lib/session.server";
import { getUserByEmail, updateLastLogin } from "~/lib/users.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Log in — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? "/integrations/stripe";
  await redirectIfAuthenticated(request, redirectTo);
  return { redirectTo };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const redirectTo = String(form.get("redirectTo") ?? "/integrations/stripe");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const user = await getUserByEmail(email);
  const ip = getClientIp(request);
  const ua = getUserAgent(request);

  if (!user || !user.isActive) {
    await recordLoginEvent({
      email,
      eventType: "login_failed",
      ipAddress: ip,
      userAgent: ua,
    });
    return { error: "Invalid email or password" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginEvent({
      userId: user.id,
      email,
      eventType: "login_failed",
      ipAddress: ip,
      userAgent: ua,
    });
    return { error: "Invalid email or password" };
  }

  await updateLastLogin(user.id);
  await recordLoginEvent({
    userId: user.id,
    email,
    eventType: "login_success",
    ipAddress: ip,
    userAgent: ua,
  });

  const sessionId = await createUserSession(request, user.id);

  throw redirect(redirectTo, {
    headers: { "Set-Cookie": createSessionCookie(sessionId) },
  });
}

export default function LoginPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const redirectTo =
    loaderData.redirectTo ?? searchParams.get("redirectTo") ?? "/integrations/stripe";

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-sand-dark/40 bg-surface-overlay/80">
        <div className="mx-auto flex h-16 max-w-md items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="text-sm font-medium text-teal underline-offset-2 hover:underline"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl">Log in</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Access is by invitation only. Contact your administrator if you need an
          account.
        </p>

        <Form method="post" className="mt-8 space-y-5">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-dark">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-dark">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          {actionData?.error && (
            <p role="alert" className="text-sm text-maroon">
              {actionData.error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-jamyang-pill bg-maroon px-5 py-2.5 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark"
          >
            Log in
          </button>
        </Form>
      </main>
    </div>
  );
}
