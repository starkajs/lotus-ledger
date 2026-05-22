import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { users } from "~/db/schema";

export async function getUserByEmail(email: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateLastLogin(userId: string) {
  const db = getDb();
  const now = new Date();
  await db
    .update(users)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, userId));
}
