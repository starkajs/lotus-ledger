import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 12;

/**
 * @param {import('postgres').Sql} sql
 * @param {{
 *   email: string;
 *   password: string;
 *   name?: string | null;
 *   role?: "admin" | "member";
 *   mustChangePassword?: boolean;
 * }} input
 */
export async function createInvitedUser(sql, input) {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const role = input.role === "admin" ? "admin" : "member";
  const mustChangePassword = input.mustChangePassword ?? true;

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const existing = await sql`
    select id from users where email = ${email} limit 1
  `;

  if (existing.length > 0) {
    throw new Error(`A user with email ${email} already exists`);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const rows = await sql`
    insert into users (
      email, password_hash, name, role, must_change_password, is_active, invited_at
    )
    values (${email}, ${passwordHash}, ${name}, ${role}, ${mustChangePassword}, true, now())
    returning id, email, name
  `;

  return rows[0];
}
