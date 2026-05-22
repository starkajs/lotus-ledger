import { randomBytes } from "node:crypto";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { getAppUrl } from "./env.server";
import { buildInviteEmailContent } from "./invite-email.server";
import { isResendConfigured, sendUserInviteEmail } from "./resend.server";
import { hashPassword } from "./password.server";
import { getUserByEmail } from "./users.server";

export type InviteUserInput = {
  email: string;
  password?: string;
  name?: string | null;
  sendEmail?: boolean;
};

export type InviteUserResult = {
  id: string;
  email: string;
  name: string | null;
  emailSent: boolean;
  resendMessageId?: string;
  temporaryPassword?: string;
};

export function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const password = input.password?.trim() || generateTemporaryPassword();
  const shouldSendEmail = input.sendEmail ?? isResendConfigured();

  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error(`A user with email ${email} already exists`);
  }

  const passwordHash = await hashPassword(password);
  const db = getDb();
  const rows = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      isActive: true,
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  const user = rows[0];
  let emailSent = false;
  let resendMessageId: string | undefined;

  if (shouldSendEmail) {
    if (!isResendConfigured()) {
      throw new Error(
        "RESEND_API_KEY and RESEND_FROM must be set to send invite emails",
      );
    }
    const sent = await sendUserInviteEmail({
      to: email,
      name,
      email,
      temporaryPassword: password,
      loginUrl: `${getAppUrl()}/login`,
    });
    emailSent = true;
    resendMessageId = sent.id;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailSent,
    resendMessageId,
    temporaryPassword: emailSent ? undefined : password,
  };
}

/** Preview invite email without sending (for dev). */
export function previewInviteEmail(params: {
  email: string;
  name: string | null;
  temporaryPassword: string;
}) {
  return buildInviteEmailContent({
    to: params.email,
    name: params.name,
    email: params.email,
    temporaryPassword: params.temporaryPassword,
    loginUrl: `${getAppUrl()}/login`,
  });
}
