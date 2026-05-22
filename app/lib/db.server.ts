import { sql } from "drizzle-orm";
import { getDb } from "~/db";
import { getDatabaseUrl } from "./env.server";

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
    const message = err instanceof Error ? err.message : "connection_failed";
    return { ok: false, error: message };
  }
}
