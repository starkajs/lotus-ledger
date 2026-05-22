import { getAppUrl } from "./env.server";

export type InviteEmailParams = {
  to: string;
  name: string | null;
  email: string;
  temporaryPassword: string;
  loginUrl?: string;
};

export function buildInviteEmailContent(params: InviteEmailParams) {
  const loginUrl = params.loginUrl ?? `${getAppUrl()}/login`;
  const greeting = params.name ? `Hello ${params.name}` : "Hello";

  const subject = "You've been invited to Lotus Ledger";

  const text = `${greeting},

You have been invited to Lotus Ledger for Jamyang London Buddhist Centre.

Sign in at: ${loginUrl}
Email: ${params.email}
Temporary password: ${params.temporaryPassword}

Please sign in and change your password when password management is available.

— Lotus Ledger`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.5; color: #2c2419; max-width: 32rem;">
  <p>${greeting},</p>
  <p>You have been invited to <strong>Lotus Ledger</strong> for Jamyang London Buddhist Centre.</p>
  <p><a href="${loginUrl}" style="color: #0d6e6e;">Sign in to Lotus Ledger</a></p>
  <table style="margin: 1.5rem 0; border-collapse: collapse;">
    <tr><td style="padding: 0.25rem 1rem 0.25rem 0; color: #6b5d4f;">Email</td><td><strong>${escapeHtml(params.email)}</strong></td></tr>
    <tr><td style="padding: 0.25rem 1rem 0.25rem 0; color: #6b5d4f;">Temporary password</td><td><code style="background: #f5f0e8; padding: 0.15rem 0.4rem; border-radius: 4px;">${escapeHtml(params.temporaryPassword)}</code></td></tr>
  </table>
  <p style="font-size: 0.875rem; color: #6b5d4f;">Keep this email private. Anyone with these credentials can access your organisation's integrations.</p>
  <p style="font-size: 0.875rem; color: #6b5d4f;">— Lotus Ledger</p>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
