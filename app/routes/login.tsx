import { Form, Link, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { SubmitButton } from "~/components/submit-button";
import {
  isLoginLocked,
  LOGIN_LOCKOUT_MESSAGE,
  recordLoginEvent,
} from "~/lib/auth-audit.server";
import { getClientIp, getUserAgent } from "~/lib/http.server";
import { rejectUnknownPassword, verifyPassword } from "~/lib/password.server";
import { safeRedirectPath } from "~/lib/redirect";
import {
  createSessionCookie,
  createUserSession,
  PASSWORD_CHANGE_PATH,
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
  const redirectTo = safeRedirectPath(url.searchParams.get("redirectTo"));
  await redirectIfAuthenticated(request, redirectTo);
  return { redirectTo };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const redirectTo = safeRedirectPath(String(form.get("redirectTo") ?? "/home"));

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const user = await getUserByEmail(email);
  const ip = getClientIp(request);
  const ua = getUserAgent(request);

  if (await isLoginLocked(email)) {
    await rejectUnknownPassword(password);
    await recordLoginEvent({
      email,
      eventType: "login_failed",
      ipAddress: ip,
      userAgent: ua,
    });
    return { error: LOGIN_LOCKOUT_MESSAGE };
  }

  const activeUser = user?.isActive ? user : null;
  if (!activeUser) {
    await rejectUnknownPassword(password);
    await recordLoginEvent({
      email,
      eventType: "login_failed",
      ipAddress: ip,
      userAgent: ua,
    });
    return { error: "Invalid email or password" };
  }

  const valid = await verifyPassword(password, activeUser.passwordHash);
  if (!valid) {
    await recordLoginEvent({
      userId: activeUser.id,
      email,
      eventType: "login_failed",
      ipAddress: ip,
      userAgent: ua,
    });
    return { error: "Invalid email or password" };
  }

  await updateLastLogin(activeUser.id);
  await recordLoginEvent({
    userId: activeUser.id,
    email,
    eventType: "login_success",
    ipAddress: ip,
    userAgent: ua,
  });

  const sessionId = await createUserSession(request, activeUser.id);
  const destination = activeUser.mustChangePassword
    ? `${PASSWORD_CHANGE_PATH}?redirectTo=${encodeURIComponent(redirectTo)}`
    : redirectTo;

  throw redirect(destination, {
    headers: { "Set-Cookie": createSessionCookie(sessionId) },
  });
}

export default function LoginPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const redirectTo =
    loaderData.redirectTo ?? searchParams.get("redirectTo") ?? "/home";

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

          <SubmitButton loadingLabel="Signing in…">Log in</SubmitButton>
        </Form>
      </main>
    </div>
  );
}
