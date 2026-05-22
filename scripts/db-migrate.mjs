import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl:
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
      ? false
      : "require",
});

const migrationPath = join(__dirname, "../db/migrations/001_stripe_connections.sql");
const migration = readFileSync(migrationPath, "utf8");

await sql.unsafe(migration);
await sql.end();

console.log("Migrations applied successfully.");
