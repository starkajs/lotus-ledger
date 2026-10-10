import type { Route } from "./+types/account.password";
import { AppPage } from "~/components/app-page";
import { ChangePasswordForm } from "~/components/change-password-form";
import { changePasswordAndOpenSession } from "~/lib/password.server";
import { safeRedirectPath } from "~/lib/redirect";
import { createSessionCookie, requireUser } from "~/lib/session.server";
import { redirect } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Choose a password — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  return {
    email: user.email,
    forced: user.mustChangePassword,
    redirectTo: safeRedirectPath(url.searchParams.get("redirectTo")),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const redirectTo = safeRedirectPath(String(form.get("redirectTo") ?? "/home"));

  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation do not match." };
  }

  try {
    const sessionId = await changePasswordAndOpenSession(request, {
      userId: user.id,
      currentPassword,
      newPassword,
    });
    throw redirect(redirectTo, {
      headers: { "Set-Cookie": createSessionCookie(sessionId) },
    });
  } catch (err) {
    if (err instanceof Response) throw err;
    return {
      error: err instanceof Error ? err.message : "Could not change password",
    };
  }
}

export default function ChoosePasswordPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <AppPage
      title={loaderData.forced ? "Choose a new password" : "Change password"}
      description={
        loaderData.forced
          ? `Sign-in for ${loaderData.email} is using a temporary password. Choose a new one to continue.`
          : "Choose a new sign-in password. Other sessions will be signed out."
      }
    >
      <section className="max-w-lg rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
        <ChangePasswordForm
          forced={loaderData.forced}
          redirectTo={loaderData.redirectTo}
          error={actionData?.error}
        />
        <p className="mt-4 text-xs text-ink-faint">
          This keeps you signed in on this browser and signs out every other
          session.
        </p>
      </section>
    </AppPage>
  );
}
