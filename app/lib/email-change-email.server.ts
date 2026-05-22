import { getAppUrl } from "./env.server";

export type EmailChangeEmailParams = {
  to: string;
  name: string | null;
  newEmail: string;
  confirmUrl: string;
  initiatedByAdmin: boolean;
};

export function buildEmailChangeEmailContent(params: EmailChangeEmailParams) {
  const greeting = params.name ? `Hello ${params.name}` : "Hello";
  const subject = "Confirm your Lotus Ledger email address";

  const intro = params.initiatedByAdmin
    ? "An administrator requested to update the email address on your Lotus Ledger account to this address."
    : "You requested to change the email address on your Lotus Ledger account.";

  const text = `${greeting},

${intro}

New email: ${params.newEmail}

Confirm this change by opening the link below (valid for 24 hours):
${params.confirmUrl}

If you did not request this, you can ignore this email.

— Lotus Ledger`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.5; color: #2c2419; max-width: 32rem;">
  <p>${greeting},</p>
  <p>${intro}</p>
  <p>New email: <strong>${escapeHtml(params.newEmail)}</strong></p>
  <p><a href="${params.confirmUrl}" style="display: inline-block; margin: 1rem 0; padding: 0.6rem 1.25rem; background: #6b2c2c; color: #fff; text-decoration: none; border-radius: 999px;">Confirm email change</a></p>
  <p style="font-size: 0.875rem; color: #6b5d4f;">Or copy this link: ${escapeHtml(params.confirmUrl)}</p>
  <p style="font-size: 0.875rem; color: #6b5d4f;">This link expires in 24 hours. If you did not request this, ignore this email.</p>
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
