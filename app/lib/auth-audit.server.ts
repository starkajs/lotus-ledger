import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { loginEvents } from "~/db/schema";
import { type LoginEventType } from "./login-event";

export type { LoginEventType };

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

const LOGIN_EVENT_PAGE_SIZE = 50;

export type LoginEventRow = {
  id: string;
  email: string;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export async function listLoginEvents(input: {
  page: number;
  eventType?: LoginEventType;
}): Promise<{
  events: LoginEventRow[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const db = getDb();
  const page = Math.max(1, input.page);
  const where = input.eventType
    ? eq(loginEvents.eventType, input.eventType)
    : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(loginEvents)
    .where(where);
  const total = countRow?.total ?? 0;
  const rows = await db
    .select({
      id: loginEvents.id,
      email: loginEvents.email,
      eventType: loginEvents.eventType,
      ipAddress: loginEvents.ipAddress,
      userAgent: loginEvents.userAgent,
      createdAt: loginEvents.createdAt,
    })
    .from(loginEvents)
    .where(where)
    .orderBy(desc(loginEvents.createdAt))
    .limit(LOGIN_EVENT_PAGE_SIZE)
    .offset((page - 1) * LOGIN_EVENT_PAGE_SIZE);

  return {
    events: rows.map((row) => ({
      id: row.id,
      email: row.email,
      eventType: row.eventType,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / LOGIN_EVENT_PAGE_SIZE)),
  };
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
