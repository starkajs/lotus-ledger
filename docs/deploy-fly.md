# Deploy Lotus Ledger to Fly.io

Do this **in order**. There is no database until step 3 — do not run `npm run db:migrate` locally until you have a `DATABASE_URL`.

Drizzle schema and migrations live in the repo (`app/db/schema.ts`, `drizzle/`). Migrations run **after** Fly Postgres exists.

## Prerequisites

- Fly CLI installed and logged in: `fly auth login`
- Org access: `fly orgs list` should show `aptim-solutions`
- Docker available (Fly builds from the repo `Dockerfile`)

## Step 1 — Create the Fly app (no deploy yet)

From the project root:

```powershell
cd c:\Users\andre\dev\lotus-ledger

fly apps create lotus-ledger --org aptim-solutions
```

Or, if you prefer the interactive wizard:

```powershell
fly launch --org aptim-solutions --name lotus-ledger --region lhr --no-deploy
```

Use the existing **Dockerfile**. Do **not** copy over `fly.toml` if prompted — use the one in the repo.

## Step 2 — First deploy (app only, no database)

`fly.toml` intentionally has **no** `release_command` yet so deploy does not require Postgres.

```powershell
fly deploy --app lotus-ledger
```

Check:

```powershell
fly open --app lotus-ledger
curl https://lotus-ledger.fly.dev/health
```

Expect `"database": "not_configured"` — that is normal.

## Step 3 — Create and attach Postgres

```powershell
fly mpg create `
  --org aptim-solutions `
  --name lotus-ledger-db `
  --region lhr `
  --plan starter `
  --volume-size 10 `
  --pg-major-version 16

fly mpg list --org aptim-solutions
```

Note the cluster **ID**, then attach it to the app (this sets `DATABASE_URL`):

```powershell
fly mpg attach <CLUSTER_ID> --app lotus-ledger
```

Verify:

```powershell
fly secrets list --app lotus-ledger
```

You should see `DATABASE_URL`.

## Step 4 — Enable migrations and redeploy

Uncomment in `fly.toml`:

```toml
[deploy]
  release_command = "node scripts/db-migrate.mjs"
```

Redeploy (runs Drizzle migrations against Fly Postgres):

```powershell
fly deploy --app lotus-ledger
```

Health check should show `"database": "connected"`.

## Step 5 — App secrets (from `.env`)

Preview what will be sent (values masked):

```powershell
npm run fly:secrets
```

Apply to Fly (reads `.env`, **excludes** `DATABASE_URL` and `SEED_*`; rewrites local `APP_URL` to `https://lotus-ledger.fly.dev`):

```powershell
npm run fly:secrets:set
```

Or use the PowerShell wrapper:

```powershell
.\scripts\fly-set-secrets.ps1 -Apply
```

Override production URL if needed:

```powershell
$env:FLY_APP_URL = "https://lotus-ledger.fly.dev"
npm run fly:secrets:set
```

`DATABASE_URL` is set by `fly mpg attach` — do not import your local proxy URL.

Seed the first user (set `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env`, proxy `DATABASE_URL` if needed):

```powershell
npm run db:seed
```

For later invites with email, set `RESEND_API_KEY` and `RESEND_FROM` on Fly, then use `/users` or `npm run invite-user`.

Register `https://lotus-ledger.fly.dev/integrations/quickbooks/callback` in the Intuit developer portal.

## Scheduled integration sync (cron)

Production runs a **sequential** sync on a schedule: **WooCommerce orders & products → Stripe balance transactions → push ready Stripe rows to QuickBooks → pull QuickBooks sales & refund receipts into Lotus**. Each step must finish before the next starts; a failure in WooCommerce, Stripe sync, or QuickBooks connection stops the run. Individual QuickBooks push failures are logged and do not stop the batch.

| Step | What runs |
|------|-----------|
| 1 | WooCommerce orders (default last 30 days) + full product catalog |
| 2 | Stripe balance transactions (classifies after upsert) |
| 3 | Push unpushed Stripe transactions to QuickBooks (Sales / Refund Receipts) for rows in the sync window that are ready |
| 4 | QuickBooks sales receipts + refund receipts (pull from QuickBooks into Lotus) |

**Local / manual:**

```powershell
npm run sync:integrations-cron
```

Optional env: `CRON_WOO_SYNC_DAYS` / `WOO_SYNC_DAYS`, `CRON_STRIPE_SYNC_DAYS` / `STRIPE_SYNC_DAYS`, `CRON_QB_PUSH_DAYS` (defaults to the Stripe window), `CRON_REPORT_TO` (comma-separated; defaults to `andrew@jamyang.co.uk` and `andrew.stark@aptim-solutions.com`). Automated windows are capped at **90 days** in code.

On Fly, set explicit cron windows (recommended):

```powershell
fly secrets set CRON_WOO_SYNC_DAYS=30 CRON_STRIPE_SYNC_DAYS=30 CRON_QB_PUSH_DAYS=30 --app lotus-ledger
```

WooCommerce (`WC_SITE`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`) and optional cron vars can be included when running `npm run fly:secrets:set` if they are in `.env`.

When `RESEND_API_KEY` and `RESEND_FROM` are set, a summary email is sent after each cron run (success or failure).

QuickBooks OAuth tokens are stored encrypted in Postgres (`quickbooks_connections`), not on the app machine filesystem, so the **cron** process can use the same connection as the web app. After upgrading, open **Integrations → QuickBooks** once (or reconnect) to migrate any legacy on-disk tokens into the database.

**Fly.io:** The Docker image includes [Supercronic](https://github.com/aptible/supercronic). Schedule is in `crontab` (default **02:00 UTC daily**). After first deploy with the cron process:

```powershell
fly deploy --app lotus-ledger
fly scale count cron=1 app=1 --app lotus-ledger
```

Only **one** `cron` machine should run (Supercronic is not safe to scale horizontally). Logs: `fly logs --app lotus-ledger --process cron`.

**Manual run on Fly** (same script as the schedule; `WORKDIR` is already `/app`):

```powershell
fly ssh console --app lotus-ledger --process-group cron -C "npm run sync:integrations-cron"
```

`fly ssh console -C` runs the command directly (no shell), so do not use `cd … && …`. To use shell syntax: `-C "sh -c 'cd /app && npm run sync:integrations-cron'"`.

To change the schedule, edit `crontab` and redeploy.

## Local dev with Fly Postgres (optional)

Proxy to the remote database:

```powershell
fly mpg proxy <CLUSTER_ID>
```

Put the proxied URL in `.env` as `DATABASE_URL`, then:

```powershell
npm run db:migrate
```

## Drizzle commands (only when `DATABASE_URL` exists)

| Command | When |
|---------|------|
| `npm run db:generate` | After changing `app/db/schema.ts` |
| `npm run db:migrate` | Against a real Postgres (Fly or local) |
| `npm run db:studio` | Browse data (dev only) |

## Useful commands

```powershell
fly status --app lotus-ledger
fly logs --app lotus-ledger
fly ssh console --app lotus-ledger
fly mpg connect --org aptim-solutions
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `lotus-ledger` already taken | Pick another name and update `app` in `fly.toml` |
| Release command fails | Postgres not attached, or `DATABASE_URL` missing |
| Health 503 database error | Run step 4 after attach |
| Build fails locally | `docker build -t lotus-ledger .` |

## Authentication

See **[auth-setup.md](auth-setup.md)** — invite users, sign in at `/login`, then configure integrations.
