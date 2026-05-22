import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "~/lib/env.server";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function useSsl(url: string): boolean | "require" {
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return false;
  }
  if (url.includes("sslmode=disable")) {
    return false;
  }
  return "require";
}

export function getDb() {
  if (!db) {
    const url = getDatabaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is not configured");
    }
    client = postgres(url, { max: 10, ssl: useSsl(url) });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export { schema };
