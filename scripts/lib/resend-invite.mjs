function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInviteEmail({ name, email, temporaryPassword, loginUrl }) {
  const greeting = name ? `Hello ${name}` : "Hello";
  const subject = "You've been invited to Lotus Ledger";

  const text = `${greeting},

You have been invited to Lotus Ledger for Jamyang London Buddhist Centre.

Sign in at: ${loginUrl}
Email: ${email}
Temporary password: ${temporaryPassword}

Please sign in and change your password when password management is available.

— Lotus Ledger`;

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.5; color: #2c2419; max-width: 32rem;">
  <p>${greeting},</p>
  <p>You have been invited to <strong>Lotus Ledger</strong> for Jamyang London Buddhist Centre.</p>
  <p><a href="${loginUrl}" style="color: #0d6e6e;">Sign in to Lotus Ledger</a></p>
  <p><strong>Email:</strong> ${escapeHtml(email)}<br>
  <strong>Temporary password:</strong> <code style="background: #f5f0e8; padding: 0.15rem 0.4rem;">${escapeHtml(temporaryPassword)}</code></p>
  <p style="font-size: 0.875rem; color: #6b5d4f;">Keep this email private.</p>
  <p style="font-size: 0.875rem; color: #6b5d4f;">— Lotus Ledger</p>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * @param {{ apiKey: string; from: string; to: string; name: string | null; email: string; temporaryPassword: string; loginUrl: string }} params
 */
export async function sendInviteEmailViaResend(params) {
  const { subject, text, html } = buildInviteEmail({
    name: params.name,
    email: params.email,
    temporaryPassword: params.temporaryPassword,
    loginUrl: params.loginUrl,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject,
      html,
      text,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? response.statusText;
    throw new Error(`Resend API error: ${message}`);
  }

  return { id: body.id };
}

export function getResendConfigFromEnv() {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.resend_api_key?.trim() ||
    "";
  const from =
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "";
  return { apiKey, from, configured: Boolean(apiKey && from) };
}
