import { Form, Link } from "react-router";
import type { Route } from "./+types/users";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { requestEmailChange } from "~/lib/email-change.server";
import { inviteUser } from "~/lib/invite.server";
import { isResendConfigured } from "~/lib/resend.server";
import { requireUser } from "~/lib/session.server";
import { deleteUser, listUsers } from "~/lib/users.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Users — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUser = await requireUser(request);
  const users = await listUsers();
  return {
    users,
    currentUserId: currentUser.id,
    resendConfigured: isResendConfigured(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUser = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    const userId = String(form.get("userId") ?? "");
    if (!userId) {
      return { scope: "delete" as const, error: "User id is required" };
    }
    try {
      await deleteUser(userId, currentUser.id);
      return { scope: "delete" as const, deleted: true as const };
    } catch (err) {
      return {
        scope: "delete" as const,
        error: err instanceof Error ? err.message : "Failed to delete user",
      };
    }
  }

  if (intent === "changeEmail") {
    const userId = String(form.get("userId") ?? "");
    const newEmail = String(form.get("newEmail") ?? "").trim();
    if (!userId || !newEmail) {
      return {
        scope: "changeEmail" as const,
        error: "User and new email are required",
      };
    }
    try {
      const result = await requestEmailChange({
        userId,
        newEmail,
        initiatedByUserId: currentUser.id,
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
        error: err instanceof Error ? err.message : "Failed to send email change",
      };
    }
  }

  if (intent === "invite") {
    const email = String(form.get("email") ?? "").trim();
    const name = String(form.get("name") ?? "").trim() || null;
    const password = String(form.get("password") ?? "").trim();
    const sendEmail = form.get("sendEmail") === "on";

    if (!email) {
      return { scope: "invite" as const, error: "Email is required" };
    }

    try {
      const result = await inviteUser({
        email,
        name,
        password: password || undefined,
        sendEmail,
      });

      return {
        scope: "invite" as const,
        success: true as const,
        email: result.email,
        emailSent: result.emailSent,
        resendMessageId: result.resendMessageId,
        temporaryPassword: result.temporaryPassword,
      };
    } catch (err) {
      return {
        scope: "invite" as const,
        error: err instanceof Error ? err.message : "Failed to invite user",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function UsersPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { users, currentUserId, resendConfigured } = loaderData;

  return (
    <AppPage
      title="Users"
      description="Invite colleagues and manage who can sign in. There is no public registration."
    >
      <div className="space-y-10">
        <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6">
          <h2 className="text-lg font-medium text-dark">Invite user</h2>
          {!resendConfigured && (
            <p
              role="status"
              className="mt-3 rounded-jamyang border border-sand-dark/50 bg-sand/30 p-3 text-sm text-ink-muted"
            >
              Resend is not configured — the temporary password will be shown
              after invite. Set <code className="text-dark">RESEND_API_KEY</code> and{" "}
              <code className="text-dark">RESEND_FROM</code> (or{" "}
              <code className="text-dark">FROM_EMAIL</code>) in{" "}
              <code className="text-dark">.env</code> to send email.
            </p>
          )}

          {actionData?.scope === "invite" && actionData.success && (
            <div
              role="status"
              className="mt-4 rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
            >
              <p className="font-medium text-dark">
                Invited {actionData.email}
                {actionData.emailSent ? " — invite email sent." : "."}
              </p>
              {actionData.temporaryPassword && (
                <p className="mt-2">
                  Temporary password:{" "}
                  <code className="rounded bg-sand px-1.5 py-0.5 font-mono text-dark">
                    {actionData.temporaryPassword}
                  </code>
                </p>
              )}
            </div>
          )}

          <Form method="post" className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="intent" value="invite" />
            <div className="sm:col-span-2">
              <label htmlFor="email" className="block text-sm font-medium text-dark">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="off"
                className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
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
                className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
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
                className="mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 font-mono text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            {resendConfigured && (
              <label className="flex items-center gap-2 text-sm text-dark sm:col-span-2">
                <input
                  type="checkbox"
                  name="sendEmail"
                  defaultChecked
                  className="size-4 rounded border-sand-dark text-maroon focus:ring-maroon"
                />
                Send invite email via Resend
              </label>
            )}
            {actionData?.scope === "invite" && actionData.error && (
              <p role="alert" className="text-sm text-maroon sm:col-span-2">
                {actionData.error}
              </p>
            )}
            <div className="sm:col-span-2">
              <SubmitButton
                intent="invite"
                variant="pill"
                loadingLabel="Sending invite…"
              >
                Send invite
              </SubmitButton>
            </div>
          </Form>
        </section>

        <section>
          <h2 className="text-lg font-medium text-dark">All users</h2>
          {actionData?.scope === "delete" && actionData.deleted && (
            <p
              role="status"
              className="mt-3 rounded-jamyang border border-jade/40 bg-jade/5 px-4 py-3 text-sm text-dark"
            >
              User removed.
            </p>
          )}
          {actionData?.scope === "delete" && actionData.error && (
            <p role="alert" className="mt-3 text-sm text-maroon">
              {actionData.error}
            </p>
          )}
          {actionData?.scope === "changeEmail" && actionData.success && (
            <p
              role="status"
              className="mt-3 rounded-jamyang border border-jade/40 bg-jade/5 px-4 py-3 text-sm text-dark"
            >
              Confirmation email sent to {actionData.newEmail}. They must open
              the link within 24 hours to complete the change.
            </p>
          )}
          {actionData?.scope === "changeEmail" && actionData.error && (
            <p role="alert" className="mt-3 text-sm text-maroon">
              {actionData.error}
            </p>
          )}

          {users.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No users yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-surface text-dark">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Invited</th>
                    <th className="px-4 py-3 font-medium">Last login</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-dark">
                          {user.name ?? "—"}
                          {isSelf && (
                            <span className="ml-2 text-xs text-ink-faint">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{user.email}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                          {formatDate(user.invitedAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSelf ? (
                            <Link
                              to="/account"
                              className="text-xs text-teal hover:underline"
                            >
                              Change email
                            </Link>
                          ) : (
                            <div className="flex flex-col items-end gap-2">
                              {resendConfigured ? (
                                <Form
                                  method="post"
                                  className="flex flex-wrap items-center justify-end gap-1.5"
                                >
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="changeEmail"
                                  />
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={user.id}
                                  />
                                  <input
                                    name="newEmail"
                                    type="email"
                                    required
                                    placeholder="New email"
                                    aria-label={`New email for ${user.email}`}
                                    className="w-36 rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-xs"
                                  />
                                  <SubmitButton
                                    intent="changeEmail"
                                    matchField="userId"
                                    matchValue={user.id}
                                    variant="outline"
                                    className="!px-2.5 !py-1 text-xs"
                                    loadingLabel="Sending…"
                                  >
                                    Send change email
                                  </SubmitButton>
                                </Form>
                              ) : (
                                <span className="text-xs text-ink-faint">
                                  Configure Resend to change email
                                </span>
                              )}
                              <Form method="post" className="inline">
                                <input type="hidden" name="intent" value="delete" />
                                <input type="hidden" name="userId" value={user.id} />
                                <SubmitButton
                                  intent="delete"
                                  matchField="userId"
                                  matchValue={user.id}
                                  variant="ghost"
                                  loadingLabel="Deleting…"
                                  onClick={(e) => {
                                    if (
                                      !confirm(
                                        `Remove ${user.email}? They will no longer be able to sign in.`,
                                      )
                                    ) {
                                      e.preventDefault();
                                    }
                                  }}
                                >
                                  Delete
                                </SubmitButton>
                              </Form>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppPage>
  );
}
