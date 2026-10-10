/** Absolute lifetime of a sign-in, and how long it may sit unused. */
export const SESSION_DAYS = 30;
export const SESSION_IDLE_HOURS = 12;

const SESSION_IDLE_MS = SESSION_IDLE_HOURS * 60 * 60 * 1000;

export function sessionLifetimeExpired(input: {
  expiresAt: Date;
  lastSeenAt: Date;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.expiresAt.getTime() < now.getTime()) return true;
  return now.getTime() - input.lastSeenAt.getTime() >= SESSION_IDLE_MS;
}

export function sessionIdleCutoff(now = new Date()): Date {
  return new Date(now.getTime() - SESSION_IDLE_MS);
}
