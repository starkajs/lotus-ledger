# Stripe integration

Lotus Ledger reads **balance transactions** from Stripe (amount, fees, net, type, description). Secret keys are stored **encrypted in Postgres** and never shown in the UI after save.

## Prerequisites

1. `DATABASE_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY` in `.env` (see [auth-setup.md](auth-setup.md))
2. `npm run db:migrate`
3. An invited user — `npm run invite-user -- you@example.com "password"`

## Add Stripe accounts

1. Sign in at `/login`
2. Open `/integrations/stripe`
3. For each Jamyang Stripe account, enter a **label** and **secret key** (`sk_test_…` or `sk_live_…`)
4. The app verifies the key, stores it encrypted, and shows only the label, last four characters, and live/test mode

## API

`GET /api/stripe/transactions?account=<connection-uuid>` (requires login session)

| Parameter | Description |
|-----------|-------------|
| `account` | Required — UUID from the integrations page |
| `limit` | Optional, max 100, default 25 |
| `starting_after` | Stripe pagination cursor |

## Production (Fly.io)

Set encryption and session secrets (not per-account Stripe keys in env):

```powershell
fly secrets set ENCRYPTION_KEY=... SESSION_SECRET=... --app lotus-ledger
```

Add keys via the integrations UI after deploy.

## Troubleshooting

| Error | Fix |
|-------|-----|
| Redirect to login | Sign in at `/login` |
| `ENCRYPTION_KEY must be set` | Add a 32+ character secret to `.env` / Fly secrets |
| Invalid secret key | Use **secret** key (`sk_` or `rk_`), not publishable (`pk_`). Paste without quotes; restricted keys use `rk_test_` / `rk_live_` |
| Empty transactions | Normal for a new test account — create a test payment in Stripe |
