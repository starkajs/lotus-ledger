import { count, desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import type { UserRole } from "./session.server";

export type UserListItem = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  invitedAt: string;
  lastLoginAt: string | null;
};

function asRole(value: string): UserRole {
  return value === "admin" ? "admin" : "member";
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
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
      role: users.role,
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
    role: asRole(row.role),
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
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target[0]) {
    throw new Error("User not found");
  }

  if (target[0].role === "admin") {
    const [admins] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    if ((admins?.value ?? 0) <= 1) {
      throw new Error("You cannot delete the last administrator.");
    }
  }

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
