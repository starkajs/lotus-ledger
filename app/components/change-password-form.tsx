import { Form } from "react-router";
import { SubmitButton } from "~/components/submit-button";

const fieldClassName =
  "mt-1 w-full rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

export function ChangePasswordForm({
  redirectTo,
  error,
  forced = false,
  action,
}: {
  redirectTo?: string;
  error?: string;
  forced?: boolean;
  action?: string;
}) {
  return (
    <Form method="post" action={action} className="mt-6 space-y-4">
      <input type="hidden" name="intent" value="changePassword" />
      {redirectTo ? (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      ) : null}
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-dark">
          {forced ? "Temporary password" : "Current password"}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-dark">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={fieldClassName}
        />
        <p className="mt-1 text-xs text-ink-faint">At least 12 characters.</p>
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-dark"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={fieldClassName}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-maroon">
          {error}
        </p>
      ) : null}
      <SubmitButton
        intent="changePassword"
        variant="pill"
        loadingLabel="Saving password…"
      >
        {forced ? "Save password and continue" : "Change password"}
      </SubmitButton>
    </Form>
  );
}
