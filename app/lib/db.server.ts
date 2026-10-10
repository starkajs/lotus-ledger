import { sql } from "drizzle-orm";
import { getDb } from "~/db";
import { getDatabaseUrl } from "./env.server";

function databaseErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) return "connection_failed";
  const parts = [err.message];
  const cause = err.cause;
  if (cause instanceof AggregateError) {
    for (const item of cause.errors) {
      if (item instanceof Error && item.message) parts.push(item.message);
    }
  } else if (cause instanceof Error && cause.message) {
    parts.push(cause.message);
  }
  return parts.join(" — ");
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "not_configured" };
  }
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    console.error("Database health check failed:", databaseErrorDetail(err));
    return { ok: false, error: "unavailable" };
  }
}
