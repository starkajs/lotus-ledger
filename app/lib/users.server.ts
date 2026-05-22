import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { stripeConnections, users } from "~/db/schema";

export type UserListItem = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  invitedAt: string;
  lastLoginAt: string | null;
};

export async function getUserByEmail(email: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUsers(): Promise<UserListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      invitedAt: users.invitedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.invitedAt));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    isActive: row.isActive,
    invitedAt: row.invitedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  }));
}

export async function deleteUser(
  userId: string,
  actingUserId: string,
): Promise<void> {
  if (userId === actingUserId) {
    throw new Error("You cannot delete your own account");
  }

  const db = getDb();
  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target[0]) {
    throw new Error("User not found");
  }

  await db
    .delete(stripeConnections)
    .where(eq(stripeConnections.addedByUserId, userId));

  const removed = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (removed.length === 0) {
    throw new Error("User could not be deleted");
  }
}

export async function updateLastLogin(userId: string) {
  const db = getDb();
  const now = new Date();
  await db
    .update(users)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, userId));
}
