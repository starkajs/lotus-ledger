import postgres from "postgres";
import { getDatabaseUrl } from "./env.server";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    const url = getDatabaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is not configured");
    }
    sql = postgres(url, {
      max: 10,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    });
  }
  return sql;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}
