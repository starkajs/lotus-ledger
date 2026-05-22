import { createHmac, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { redirect } from "react-router";
import { getDb } from "~/db";
import { sessions, users } from "~/db/schema";
import { recordLoginEvent } from "./auth-audit.server";
import { getClientIp, getCookie, getUserAgent } from "./http.server";
import { getOAuthStateSecret } from "./env.server";

const SESSION_COOKIE = "lotus_session";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
};

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", getOAuthStateSecret())
    .update(sessionId)
    .digest("hex");
  return `${sessionId}.${signature}`;
}

function verifySignedSessionId(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;

  const [sessionId, signature] = parts;
  const expected = createHmac("sha256", getOAuthStateSecret())
    .update(sessionId)
    .digest("hex");

  if (signature !== expected) return null;
  return sessionId;
}

function sessionCookieOptions(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function createSessionCookie(sessionId: string): string {
  const signed = signSessionId(sessionId);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${encodeURIComponent(signed)}; ${sessionCookieOptions(maxAge)}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${sessionCookieOptions(0)}`;
}

export async function createUserSession(
  request: Request,
  userId: string,
): Promise<string> {
  const db = getDb();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  const rows = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    })
    .returning({ id: sessions.id });

  return rows[0].id;
}

export async function destroyUserSession(
  request: Request,
  options?: { recordLogout?: boolean; user?: AuthUser | null },
): Promise<void> {
  const raw = getCookie(request, SESSION_COOKIE);
  const sessionId = verifySignedSessionId(raw ? decodeURIComponent(raw) : null);
  if (!sessionId) return;

  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));

  if (options?.recordLogout && options.user) {
    await recordLoginEvent({
      userId: options.user.id,
      email: options.user.email,
      eventType: "logout",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
  }
}

async function touchSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function getUserFromRequest(
  request: Request,
): Promise<AuthUser | null> {
  const raw = getCookie(request, SESSION_COOKIE);
  const sessionId = verifySignedSessionId(raw ? decodeURIComponent(raw) : null);
  if (!sessionId) return null;

  const db = getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row || row.expiresAt < new Date() || !row.isActive) {
    if (row) await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  await touchSession(sessionId);

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const user = await getUserFromRequest(request);
  if (!user) {
    const url = new URL(request.url);
    const redirectTo = encodeURIComponent(url.pathname + url.search);
    throw redirect(`/login?redirectTo=${redirectTo}`);
  }
  return user;
}

export async function redirectIfAuthenticated(
  request: Request,
  redirectTo = "/integrations/stripe",
) {
  const user = await getUserFromRequest(request);
  if (user) throw redirect(redirectTo);
}

export async function cleanupExpiredSessions(): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
