import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "~/db";
import { emailChangeTokens, sessions, users } from "~/db/schema";
import { buildEmailChangeEmailContent } from "./email-change-email.server";
import { getAppUrl } from "./env.server";
import { verifyPassword } from "./password.server";
import { isResendConfigured, sendEmailChangeEmail } from "./resend.server";
import { getUserByEmail, getUserById } from "./users.server";

const TOKEN_EXPIRY_HOURS = 24;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export type RequestEmailChangeInput = {
  userId: string;
  newEmail: string;
  /** Required when the user changes their own email. */
  currentPassword?: string;
  /** Set when an admin initiates the change for another user. */
  initiatedByUserId?: string;
  sendEmail?: boolean;
};

export type RequestEmailChangeResult = {
  newEmail: string;
  emailSent: boolean;
  resendMessageId?: string;
};

export async function requestEmailChange(
  input: RequestEmailChangeInput,
): Promise<RequestEmailChangeResult> {
  const newEmail = normalizeEmail(input.newEmail);
  if (!newEmail || !newEmail.includes("@")) {
    throw new Error("A valid email address is required");
  }

  const user = await getUserById(input.userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.email === newEmail) {
    throw new Error("That is already your email address");
  }

  const existing = await getUserByEmail(newEmail);
  if (existing && existing.id !== input.userId) {
    throw new Error("That email address is already in use");
  }

  const isAdminInitiated = Boolean(input.initiatedByUserId);
  if (isAdminInitiated) {
    if (input.initiatedByUserId === input.userId) {
      throw new Error("Use Account settings to change your own email");
    }
  } else {
    if (!input.currentPassword) {
      throw new Error("Current password is required");
    }
    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error("Current password is incorrect");
    }
  }

  const shouldSendEmail = input.sendEmail ?? isResendConfigured();
  if (!shouldSendEmail) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and RESEND_FROM to send confirmation emails.",
    );
  }

  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

  const db = getDb();
  await db
    .delete(emailChangeTokens)
    .where(
      and(
        eq(emailChangeTokens.userId, input.userId),
        isNull(emailChangeTokens.usedAt),
      ),
    );

  await db.insert(emailChangeTokens).values({
    userId: input.userId,
    newEmail,
    tokenHash,
    initiatedByUserId: input.initiatedByUserId ?? null,
    expiresAt,
  });

  const confirmUrl = `${getAppUrl()}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;
  const sent = await sendEmailChangeEmail({
    to: newEmail,
    name: user.name,
    newEmail,
    confirmUrl,
    initiatedByAdmin: isAdminInitiated,
  });

  return {
    newEmail,
    emailSent: true,
    resendMessageId: sent.id,
  };
}

export type ConfirmEmailChangeResult = {
  email: string;
};

export async function confirmEmailChange(
  rawToken: string,
): Promise<ConfirmEmailChangeResult> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("Invalid or expired confirmation link");
  }

  const db = getDb();
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      id: emailChangeTokens.id,
      userId: emailChangeTokens.userId,
      newEmail: emailChangeTokens.newEmail,
      expiresAt: emailChangeTokens.expiresAt,
      usedAt: emailChangeTokens.usedAt,
    })
    .from(emailChangeTokens)
    .where(eq(emailChangeTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new Error("Invalid or expired confirmation link");
  }

  const existing = await getUserByEmail(row.newEmail);
  if (existing && existing.id !== row.userId) {
    throw new Error("That email address is already in use");
  }

  const now = new Date();
  await db
    .update(users)
    .set({ email: row.newEmail, updatedAt: now })
    .where(eq(users.id, row.userId));

  await db
    .update(emailChangeTokens)
    .set({ usedAt: now })
    .where(eq(emailChangeTokens.id, row.id));

  await db.delete(sessions).where(eq(sessions.userId, row.userId));

  return { email: row.newEmail };
}
