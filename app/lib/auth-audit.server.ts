import { getDb } from "~/db";
import { loginEvents } from "~/db/schema";

export type LoginEventType = "login_success" | "login_failed" | "logout";

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
