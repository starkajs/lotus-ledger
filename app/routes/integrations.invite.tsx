import { Form, Link } from "react-router";
import type { Route } from "./+types/integrations.invite";
import { inviteUser } from "~/lib/invite.server";
import { isResendConfigured } from "~/lib/resend.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Invite user — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return {
    user,
    resendConfigured: isResendConfigured(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "").trim() || null;
  const password = String(form.get("password") ?? "").trim();
  const sendEmail = form.get("sendEmail") === "on";

  if (!email) {
    return { error: "Email is required" };
  }

  try {
    const result = await inviteUser({
      email,
      name,
      password: password || undefined,
      sendEmail,
    });

    return {
      success: true as const,
      email: result.email,
      emailSent: result.emailSent,
      resendMessageId: result.resendMessageId,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to invite user",
    };
  }
}

export default function InviteUserPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user, resendConfigured } = loaderData;

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-sand-dark/40 bg-surface-overlay/80">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-4 sm:px-6">
          <Link
            to="/integrations/stripe"
            className="text-sm font-medium text-teal underline-offset-2 hover:underline"
          >
            ← Integrations
          </Link>
          <div className="flex items-center gap-4 text-sm text-ink-muted">
            <span>{user.email}</span>
            <Link
              to="/logout"
              className="text-teal underline-offset-2 hover:underline"
            >
              Log out
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl">Invite user</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Create an account and send login details by email. There is no public
          sign-up.
        </p>

        {!resendConfigured && (
          <p
            role="status"
            className="mt-4 rounded-jamyang border border-sand-dark/50 bg-sand/30 p-3 text-sm text-ink-muted"
          >
            Resend is not configured — the temporary password will be shown here
            after invite. Set <code className="text-dark">RESEND_API_KEY</code> and{" "}
            <code className="text-dark">RESEND_FROM</code> in the environment to
            send email.
          </p>
        )}

        {actionData?.success && (
          <div
            role="status"
            className="mt-6 rounded-jamyang-lg border border-jade/40 bg-jade/5 p-4 text-sm"
          >
            <p className="font-medium text-dark">
              Invited {actionData.email}
              {actionData.emailSent ? " — invite email sent." : "."}
            </p>
            {actionData.resendMessageId && (
              <p className="mt-1 text-ink-muted">
                Resend message id: {actionData.resendMessageId}
              </p>
            )}
            {actionData.temporaryPassword && (
              <p className="mt-2">
                Temporary password (share securely):{" "}
                <code className="rounded bg-sand px-1.5 py-0.5 font-mono text-dark">
                  {actionData.temporaryPassword}
                </code>
              </p>
            )}
          </div>
        )}

        <Form method="post" className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-dark">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-dark">
              Name <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-dark"
            >
              Temporary password{" "}
              <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input
              id="password"
              name="password"
              type="text"
              autoComplete="off"
              placeholder="Leave blank to generate"
              className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-3 py-2 font-mono text-sm text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          {resendConfigured && (
            <label className="flex items-center gap-2 text-sm text-dark">
              <input
                type="checkbox"
                name="sendEmail"
                defaultChecked
                className="size-4 rounded border-sand-dark text-maroon focus:ring-maroon"
              />
              Send invite email via Resend
            </label>
          )}

          {actionData?.error && (
            <p role="alert" className="text-sm text-maroon">
              {actionData.error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-jamyang-pill bg-maroon px-5 py-2.5 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark"
          >
            Invite user
          </button>
        </Form>
      </main>
    </div>
  );
}
