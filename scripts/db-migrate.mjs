import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Load .env for local dev only (Fly injects DATABASE_URL; dotenv is devDependency)
if (!process.env.DATABASE_URL) {
  try {
    await import("dotenv/config");
  } catch {
    // dotenv not available in production image
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const useSsl =
  databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
    ? false
    : databaseUrl.includes("sslmode=disable")
      ? false
      : "require";

const client = postgres(databaseUrl, { max: 1, ssl: useSsl });
const db = drizzle(client);

console.log("Running Drizzle migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
await client.end();
console.log("Migrations complete.");
