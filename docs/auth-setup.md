# Authentication

Lotus Ledger uses **invite-only** access: there is no public registration.

## Environment

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Signs session cookies (required in production) |
| `ENCRYPTION_KEY` | Encrypts Stripe secret keys at rest (min. 32 characters) |
| `DATABASE_URL` | Postgres for users, sessions, audit log, Stripe connections |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | First user for `npm run db:seed` |
| `RESEND_API_KEY` | Resend API key for invite emails |
| `RESEND_FROM` | Sender, e.g. `Lotus Ledger <noreply@yourdomain.com>` |
| `APP_URL` | Used in invite emails for the login link |

Generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set on Fly:

```bash
fly secrets set SESSION_SECRET=... ENCRYPTION_KEY=... RESEND_API_KEY=... RESEND_FROM="Lotus Ledger <noreply@yourdomain.com>" -a lotus-ledger
```

## First user (seed)

After migrations, add to `.env`:

```env
SEED_USER_EMAIL=you@example.com
SEED_USER_PASSWORD=choose-a-strong-password
SEED_USER_NAME=Your Name
```

Then:

```bash
npm run db:seed
```

Sign in at `/login`. Re-running seed is safe if the user already exists (it exits without error).

## Invite more users

### By email (Resend)

With `RESEND_API_KEY` and `RESEND_FROM` set:

```bash
npm run invite-user -- colleague@example.com "temporary-password" "Their Name"
```

Or use **Invite user** at `/integrations/invite` while logged in (checkbox to send email when Resend is configured).

### Without email

```bash
npm run invite-user -- user@example.com "temporary-password" --no-email
```

Share the password securely yourself.

## Sessions and audit

- Sessions are stored in Postgres with IP, user agent, expiry, and `last_seen_at` on each request.
- `login_events` records successful logins, failures, and logouts.
- `users.last_login_at` updates on each successful login.

## Stripe keys

After login, open `/integrations/stripe` to add one or more Stripe accounts. Secret keys are encrypted with AES-256-GCM; only the label, last four characters, and account metadata are shown after save.

## Protected routes

All `/integrations/*` and `/api/*` routes require an authenticated session. Unauthenticated visitors are redirected to `/login`.
