import { Form } from "react-router";
import type { Route } from "./+types/account";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { ChangePasswordForm } from "~/components/change-password-form";
import { requestEmailChange } from "~/lib/email-change.server";
import { isResendConfigured } from "~/lib/resend.server";
import { SESSION_DAYS, SESSION_IDLE_HOURS } from "~/lib/session-expiry";
import {
  destroyOtherSessions,
  getSessionIdFromRequest,
  listUserSessions,
  requireUser,
} from "~/lib/session.server";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Account — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const currentSessionId = getSessionIdFromRequest(request);
  const sessions = await listUserSessions(user.id, currentSessionId);
  return {
    user,
    resendConfigured: isResendConfigured(),
    sessions,
    idleHours: SESSION_IDLE_HOURS,
    sessionDays: SESSION_DAYS,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "signOutOthers") {
    const sessionId = getSessionIdFromRequest(request);
    if (!sessionId) {
      return {
        scope: "signOutOthers" as const,
        error: "This browser is not signed in.",
      };
    }
    const signedOut = await destroyOtherSessions(user.id, sessionId);
    return { scope: "signOutOthers" as const, signedOut };
  }

  if (intent === "changeEmail") {
    const newEmail = String(form.get("newEmail") ?? "").trim();
    const currentPassword = String(form.get("currentPassword") ?? "");

    if (!newEmail) {
      return { scope: "changeEmail" as const, error: "New email is required" };
    }

    try {
      const result = await requestEmailChange({
        userId: user.id,
        newEmail,
        currentPassword,
      });
      return {
        scope: "changeEmail" as const,
        success: true as const,
        newEmail: result.newEmail,
        emailSent: result.emailSent,
      };
    } catch (err) {
      return {
        scope: "changeEmail" as const,
        error: err instanceof Error ? err.message : "Failed to request email change",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function AccountPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user, resendConfigured, sessions, idleHours, sessionDays } =
    loaderData;
  const otherSessions = sessions.filter((session) => !session.current).length;

  return (
    <AppPage
      title="Account"
      description="Manage your sign-in details."
    >
      <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6 max-w-lg">
        <h2 className="text-lg font-medium text-dark">Sign-in email</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Current address: <span className="font-medium text-dark">{user.email}</span>
        </p>

        {!resendConfigured && (
          <p
            role="status"
            className="mt-4 rounded-jamyang border border-sand-dark/50 bg-sand/30 p-3 text-sm text-ink-muted"
          >
            Email sending is not configured. Set{" "}
            <code className="text-dark">RESEND_API_KEY</code> and{" "}
            <code className="text-dark">RESEND_FROM</code> in{" "}
            <code className="text-dark">.env</code> to change your email.
          </p>
        )}

        {actionData?.scope === "changeEmail" && actionData.success && (
          <div
            role="status"
            className="mt-4 rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
          >
            <p className="font-medium text-dark">Confirmation email sent</p>
            <p className="mt-1 text-ink-muted">
              We sent a link to <strong>{actionData.newEmail}</strong>. Open it
              within 24 hours to confirm. You will need to sign in again with
              your new email afterward.
            </p>
          </div>
        )}

        {resendConfigured && (
          <Form method="post" className="mt-6 space-y-4">
            <div>
              <label htmlFor="newEmail" className="block text-sm font-medium text-dark">
                New email
              </label>
              <input
                id="newEmail"
                name="newEmail"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-dark"
              >
                Current password
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            {actionData?.scope === "changeEmail" && actionData.error && (
              <p role="alert" className="text-sm text-maroon">
                {actionData.error}
              </p>
            )}
            <SubmitButton
              intent="changeEmail"
              variant="pill"
              loadingLabel="Sending confirmation…"
            >
              Send confirmation email
            </SubmitButton>
          </Form>
        )}

        <p className="mt-4 text-xs text-ink-faint">
          For security, the confirmation link is sent to your new address only.
          All active sessions are ended when you confirm the change.
        </p>
      </section>

      <section className="mt-8 max-w-lg rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
        <h2 className="text-lg font-medium text-dark">Sessions</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A sign-in ends after {idleHours} hours without use, or after{" "}
          {sessionDays} days even if it is used. Changing your password also
          signs out every other session.
        </p>

        <ul className="mt-4 space-y-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="rounded-jamyang border border-sand-dark/40 px-3 py-2 text-sm"
            >
              <p className="font-medium text-dark">
                {session.current ? "This browser" : "Another session"}
              </p>
              <p className="mt-1 text-ink-muted">
                Last used {formatWhen(session.lastSeenAt)}
                {session.ipAddress ? ` · ${session.ipAddress}` : ""}
              </p>
            </li>
          ))}
        </ul>

        {actionData?.scope === "signOutOthers" &&
        "signedOut" in actionData ? (
          <p role="status" className="mt-4 text-sm text-dark">
            {actionData.signedOut === 0
              ? "There were no other sessions."
              : actionData.signedOut === 1
                ? "Signed out 1 other session."
                : `Signed out ${actionData.signedOut} other sessions.`}
          </p>
        ) : null}
        {actionData?.scope === "signOutOthers" && actionData.error ? (
          <p role="alert" className="mt-4 text-sm text-maroon">
            {actionData.error}
          </p>
        ) : null}

        {otherSessions > 0 ? (
          <Form method="post" className="mt-4">
            <SubmitButton
              intent="signOutOthers"
              variant="outline"
              loadingLabel="Signing out…"
            >
              Sign out other sessions
            </SubmitButton>
          </Form>
        ) : (
          <p className="mt-4 text-xs text-ink-faint">
            No other sessions are signed in.
          </p>
        )}
      </section>

      <section className="mt-8 max-w-lg rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
        <h2 className="text-lg font-medium text-dark">Password</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Use at least 12 characters. Changing it signs out every other session.
        </p>
        <ChangePasswordForm action="/account/password" redirectTo="/account" />
      </section>
    </AppPage>
  );
}
