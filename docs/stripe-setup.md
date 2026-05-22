# Stripe integration

Lotus Ledger reads **balance transactions** from Stripe (amount, fees, net, type, description). All calls are server-side — the secret key never reaches the browser.

## Current setup (single account)

Use one restricted secret key in `.env` to prove the integration works:

```env
STRIPE_SECRET_KEY=sk_test_...
```

Restart after changes:

```bash
npm run dev
```

Validate at:

- **UI:** [http://localhost:5173/integrations/stripe](http://localhost:5173/integrations/stripe)
- **JSON:** [http://localhost:5173/api/stripe/transactions](http://localhost:5173/api/stripe/transactions)

Swap the key in `.env` to test a different Stripe account.

## Multiple accounts (planned)

Jamyang has more than one Stripe account. Later we will:

1. Store **one encrypted secret key per account** in Postgres (`stripe_connections` table — migration already in `db/migrations/`).
2. Remove per-account keys from `.env`.
3. Select which account to query in the UI or API.

The schema and `npm run db:migrate` are ready when `DATABASE_URL` is configured; Stripe does not require the database until then.

## Production (Fly.io)

```powershell
fly secrets set STRIPE_SECRET_KEY=sk_live_... --app lotus-ledger
```

## API

`GET /api/stripe/transactions`

| Parameter | Description |
|-----------|-------------|
| `limit` | Optional, max 100, default 25 |
| `starting_after` | Stripe pagination cursor |

## Troubleshooting

| Error | Fix |
|-------|-----|
| `STRIPE_SECRET_KEY is not configured` | Add `.env` and restart `npm run dev` |
| `Invalid API Key` | Check the key is complete with no extra spaces |
| Empty transactions | Normal for a new test account — create a test payment in Stripe |
