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
