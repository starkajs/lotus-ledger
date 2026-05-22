import bcrypt from "bcryptjs";

/**
 * @param {import('postgres').Sql} sql
 * @param {{ email: string; password: string; name?: string | null }} input
 */
export async function createInvitedUser(sql, input) {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;

  const existing = await sql`
    select id from users where email = ${email} limit 1
  `;

  if (existing.length > 0) {
    throw new Error(`A user with email ${email} already exists`);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const rows = await sql`
    insert into users (email, password_hash, name, is_active, invited_at)
    values (${email}, ${passwordHash}, ${name}, true, now())
    returning id, email, name
  `;

  return rows[0];
}
