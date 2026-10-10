import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import {
  createUserSession,
  destroyAllSessionsForUser,
} from "./session.server";
import { getUserById } from "./users.server";

export const MIN_PASSWORD_LENGTH = 12;

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** Cost-12 hash of a throwaway secret. Used so unknown emails take as long as a real check. */
const DUMMY_PASSWORD_HASH =
  "$2b$12$7xlLDigZQS2p8ZNO9Eegs.qLEE.h5lXHWGvjEf44rQhboctIErJ1i";

/** Spends a bcrypt compare when there is no real password to check. Always rejects. */
export async function rejectUnknownPassword(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const policy = passwordPolicyError(input.newPassword);
  if (policy) throw new Error(policy);
  if (input.newPassword === input.currentPassword) {
    throw new Error("Choose a different password from the current one.");
  }

  const user = await getUserById(input.userId);
  if (!user) throw new Error("User not found");

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const db = getDb();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  await destroyAllSessionsForUser(input.userId);
}

/** Change the password, end every existing session, and open a fresh one. */
export async function changePasswordAndOpenSession(
  request: Request,
  input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  },
): Promise<string> {
  await changePassword(input);
  return createUserSession(request, input.userId);
}

/** Replace the password with a one-time value and sign the user out everywhere. */
export async function resetUserPassword(userId: string): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const temporaryPassword = generateTemporaryPassword();
  const db = getDb();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await destroyAllSessionsForUser(userId);
  return temporaryPassword;
}
