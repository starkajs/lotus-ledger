import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { loginEvents } from "~/db/schema";

export type LoginEventType = "login_success" | "login_failed" | "logout";

export const LOGIN_LOCKOUT_ATTEMPTS = 10;
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCKOUT_MESSAGE =
  "Too many sign-in attempts. Try again in 15 minutes.";

export async function isLoginLocked(email: string): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS);
  const [row] = await db
    .select({ total: count() })
    .from(loginEvents)
    .where(
      and(
        eq(loginEvents.email, email.toLowerCase()),
        eq(loginEvents.eventType, "login_failed"),
        gte(loginEvents.createdAt, since),
      ),
    );
  return (row?.total ?? 0) >= LOGIN_LOCKOUT_ATTEMPTS;
}

export async function recordLoginEvent(input: {
  userId?: string | null;
  email: string;
  eventType: LoginEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = getDb();
  await db.insert(loginEvents).values({
    userId: input.userId ?? null,
    email: input.email.toLowerCase(),
    eventType: input.eventType,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}
