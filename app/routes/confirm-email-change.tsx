import { Form, Link } from "react-router";
import type { Route } from "./+types/confirm-email-change";
import { SubmitButton } from "~/components/submit-button";
import { confirmEmailChange } from "~/lib/email-change.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Confirm email — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return { status: "invalid" as const };
  return { status: "ready" as const, token };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");

  try {
    const result = await confirmEmailChange(token);
    return { status: "success" as const, email: result.email };
  } catch (err) {
    return {
      status: "error" as const,
      message:
        err instanceof Error ? err.message : "Could not confirm email change",
    };
  }
}

export default function ConfirmEmailChangePage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  if (loaderData.status === "invalid") {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl text-dark">Invalid link</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This confirmation link is missing or malformed.
        </p>
        <p className="mt-6">
          <Link to="/login" className="text-teal hover:underline">
            Go to sign in
          </Link>
        </p>
      </main>
    );
  }

  if (actionData?.status === "error") {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl text-dark">Could not confirm</h1>
        <p className="mt-2 text-sm text-maroon">{actionData.message}</p>
        <p className="mt-4 text-sm text-ink-muted">
          Request a new confirmation email from Account settings or ask an
          administrator to send one from the Users page.
        </p>
        <p className="mt-6">
          <Link to="/login" className="text-teal hover:underline">
            Go to sign in
          </Link>
        </p>
      </main>
    );
  }

  if (actionData?.status === "success") {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl text-dark">Email updated</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your sign-in email is now{" "}
          <strong className="text-dark">{actionData.email}</strong>.
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          For security, existing sessions were signed out. Please sign in with
          your new email.
        </p>
        <p className="mt-6">
          <Link
            to="/login"
            className="inline-flex rounded-jamyang-pill bg-maroon px-5 py-2 text-sm font-medium text-surface-overlay hover:bg-maroon-dark"
          >
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl text-dark">Confirm email change</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Press confirm to switch your sign-in address. Opening this page does
        not change it.
      </p>
      <Form method="post" className="mt-6">
        <input type="hidden" name="token" value={loaderData.token} />
        <SubmitButton variant="pill" loadingLabel="Confirming…">
          Confirm email change
        </SubmitButton>
      </Form>
    </main>
  );
}
