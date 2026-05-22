/**
 * Create the first user from environment variables (no email).
 *
 * Set in .env:
 *   SEED_USER_EMAIL=admin@example.com
 *   SEED_USER_PASSWORD=change-me
 *   SEED_USER_NAME=Admin          (optional)
 *
 * Usage:
 *   npm run db:seed
 */
import "dotenv/config";
import postgres from "postgres";
import { createInvitedUser } from "./lib/user-invite.mjs";

const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD?.trim();
const name = process.env.SEED_USER_NAME?.trim() || null;

if (!email || !password) {
  console.error(
    "Set SEED_USER_EMAIL and SEED_USER_PASSWORD in .env, then run: npm run db:seed",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const user = await createInvitedUser(sql, { email, password, name });
  console.log(`Seeded user ${user.email} (${user.id})`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("already exists")) {
    console.log(message);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
} finally {
  await sql.end();
}
