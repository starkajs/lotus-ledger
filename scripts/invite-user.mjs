/**
 * Invite a user (no self-registration). Optionally sends invite email via Resend.
 *
 * Usage:
 *   npm run invite-user -- user@example.com "temporary-password" "Display Name"
 *   npm run invite-user -- user@example.com "temporary-password" --no-email
 *
 * Sends email when RESEND_API_KEY and RESEND_FROM are set, unless --no-email is passed.
 */
import "dotenv/config";
import postgres from "postgres";
import { createInvitedUser } from "./lib/user-invite.mjs";
import {
  getResendConfigFromEnv,
  sendInviteEmailViaResend,
} from "./lib/resend-invite.mjs";

const rawArgs = process.argv.slice(2);
const noEmail = rawArgs.includes("--no-email");
const args = rawArgs.filter((a) => a !== "--no-email");

if (args.length < 2) {
  console.error(
    "Usage: npm run invite-user -- <email> <password> [name] [--no-email]",
  );
  process.exit(1);
}

const email = args[0].trim().toLowerCase();
const password = args[1];
const name = args[2]?.trim() || null;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let appUrl = process.env.APP_URL?.trim() || "http://localhost:5174";
appUrl = appUrl.replace(/\/$/, "");
appUrl = appUrl.replace(/\/integrations\/quickbooks\/callback$/i, "");

const sql = postgres(databaseUrl, { max: 1 });

try {
  const user = await createInvitedUser(sql, { email, password, name });
  console.log(`Created user ${user.email} (${user.id})`);

  const resend = getResendConfigFromEnv();
  if (!noEmail && resend.configured) {
    const sent = await sendInviteEmailViaResend({
      apiKey: resend.apiKey,
      from: resend.from,
      to: email,
      name,
      email,
      temporaryPassword: password,
      loginUrl: `${appUrl}/login`,
    });
    console.log(`Invite email sent (Resend id: ${sent.id})`);
  } else if (!noEmail && !resend.configured) {
    console.log(
      "No invite email sent — set RESEND_API_KEY and RESEND_FROM to enable, or omit --no-email when configured.",
    );
    console.log(`Temporary password (share securely): ${password}`);
  } else {
    console.log(`Temporary password (share securely): ${password}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end();
}
