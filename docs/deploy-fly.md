# Deploying Lotus Ledger to Fly.io

This guide deploys the app to the **aptim-solutions** organisation on Fly.io, with **Managed Postgres (MPG)** for the database.

## Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated (`fly auth login`)
- Access to the `aptim-solutions` org (`fly orgs list`)
- Docker available locally (Fly builds from the repo `Dockerfile`)

## Architecture

| Resource | Name | Region | Purpose |
|----------|------|--------|---------|
| Web app | `lotus-ledger` | `lhr` | SSR React Router app |
| Postgres | `lotus-ledger-db` | `lhr` | Managed Postgres cluster |

The web app exposes **`/health`** for Fly health checks. After attaching Postgres, Fly injects a **`DATABASE_URL`** secret (not used by the app yet, but ready for migrations/ORM).

## 1. First-time app setup

If the app does not exist on Fly yet:

```powershell
cd path\to\lotus-ledger

fly launch `
  --org aptim-solutions `
  --name lotus-ledger `
  --region lhr `
  --no-deploy
```

When prompted:

- **Use existing Dockerfile?** → Yes
- **Copy configuration?** → No (this repo already includes `fly.toml`)

If the app already exists, skip `fly launch` and deploy with the committed `fly.toml`.

### fly.toml highlights

- Listens on **port 3000** (`PORT` + `internal_port`)
- **London (`lhr`)** primary region
- **HTTP health check** on `GET /health`
- **Auto stop/start** machines when idle (`min_machines_running = 0` for lower cost)

For always-on production, set `min_machines_running = 1` in `fly.toml`.

## 2. Create Managed Postgres

```powershell
fly mpg create `
  --org aptim-solutions `
  --name lotus-ledger-db `
  --region lhr `
  --plan starter `
  --volume-size 10 `
  --pg-major-version 16
```

List clusters and note the **cluster ID**:

```powershell
fly mpg list --org aptim-solutions
```

### Legacy Postgres (alternative)

If you prefer a self-managed Postgres Fly app instead of MPG:

```powershell
fly postgres create `
  --org aptim-solutions `
  --name lotus-ledger-db `
  --region lhr `
  --initial-cluster-size 1 `
  --vm-size shared-cpu-1x `
  --volume-size 10
```

Attach with:

```powershell
fly postgres attach lotus-ledger-db --app lotus-ledger
```

## 3. Attach Postgres to the web app

```powershell
fly mpg attach <CLUSTER_ID> --app lotus-ledger
```

Verify the secret was set:

```powershell
fly secrets list --app lotus-ledger
```

You should see `DATABASE_URL` (value is hidden).

## 4. Deploy

```powershell
fly deploy --app lotus-ledger
```

Check status and open the site:

```powershell
fly status --app lotus-ledger
fly open --app lotus-ledger
```

Test the health endpoint:

```powershell
curl https://lotus-ledger.fly.dev/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-22T12:00:00.000Z",
  "database": "configured"
}
```

## 5. Custom domain (optional)

```powershell
fly certs add ledger.yourdomain.com --app lotus-ledger
```

Add the DNS records Fly prints. HTTPS is provisioned automatically once DNS propagates.

## Day-to-day commands

```powershell
# Stream logs
fly logs --app lotus-ledger

# SSH into a running machine
fly ssh console --app lotus-ledger

# Connect to Postgres (MPG)
fly mpg connect --org aptim-solutions

# Scale VM memory
fly scale memory 1024 --app lotus-ledger

# Redeploy after code changes
fly deploy --app lotus-ledger
```

## Local Docker smoke test

```powershell
docker build -t lotus-ledger .
docker run --rm -p 3000:3000 -e PORT=3000 lotus-ledger
```

Then visit `http://localhost:3000/health`.

## Adding database code later

Read the connection string from the environment:

```ts
const databaseUrl = process.env.DATABASE_URL;
```

Run migrations on deploy with a `release_command` in `fly.toml` when you add an ORM, for example:

```toml
[deploy]
  release_command = "npx prisma migrate deploy"
```

## Cost notes

- The web app on a shared CPU with auto-stop can be inexpensive for low traffic.
- MPG is billed separately; start with the **starter** plan and scale as needed.
- Never commit `DATABASE_URL`; use Fly secrets only.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Health check failing | `fly logs --app lotus-ledger`; confirm `GET /health` returns 200 |
| 502 / connection refused | `internal_port` and `PORT` must both be `3000` |
| Database not configured | Run `fly mpg attach` and redeploy |
| Build fails | Run `docker build -t lotus-ledger .` locally to reproduce |
