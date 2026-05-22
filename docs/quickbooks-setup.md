# QuickBooks Online integration

Intuit requires **OAuth 2.0** — the same model Make.com uses behind “Connect QuickBooks”. You click once, sign in, and the app stores a **refresh token**.

Jamyang has **one** QuickBooks company, so we use a single OAuth connection (tokens stored locally for now, database later).

## 1. Create an Intuit app

1. Go to [developer.intuit.com](https://developer.intuit.com) → **My Hub** → create an app.
2. Add **QuickBooks Online and Payments** scope.
3. Under **Keys & credentials**, copy **Client ID** and **Client secret** (start with **Development** / sandbox).
4. Under **Redirect URIs**, add exactly:

   ```
   http://localhost:5174/integrations/quickbooks/callback
   ```

   Production: `https://your-domain/integrations/quickbooks/callback`

## 2. Environment variables

Add to `.env`:

```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=sandbox
APP_URL=http://localhost:5174
SESSION_SECRET=any-long-random-string
```

`APP_URL` must be your **site root only** (scheme + host + port). Do **not** include `/integrations/quickbooks/callback` — the app adds that path automatically.

Wrong:

```env
APP_URL=http://localhost:5174/integrations/quickbooks/callback
```

Right:

```env
APP_URL=http://localhost:5174
```

Use the same port your dev server prints when you run `npm run dev` (5173 or 5174).

Use `QUICKBOOKS_ENVIRONMENT=production` when connecting the live Jamyang books.

Restart:

```bash
npm run dev
```

## 3. Connect

1. Open [http://localhost:5174/integrations/quickbooks](http://localhost:5174/integrations/quickbooks)
2. Click **Connect QuickBooks**
3. Sign in with the Intuit account that owns Jamyang’s QBO company
4. Approve access

Tokens are saved to `.data/quickbooks-tokens.json` (gitignored). The page should show company name and recent invoices.

## 4. API

`GET /api/quickbooks/invoices?limit=25`

Requires an active connection.

## 5. Sandbox vs production

| Environment | Use for |
|-------------|---------|
| `sandbox` | Intuit developer test companies |
| `production` | Real Jamyang QuickBooks |

Switch `QUICKBOOKS_ENVIRONMENT` and use matching keys from the Intuit portal. Re-connect after switching.

## 6. Production (Fly.io)

```powershell
fly secrets set `
  QUICKBOOKS_CLIENT_ID=... `
  QUICKBOOKS_CLIENT_SECRET=... `
  QUICKBOOKS_ENVIRONMENT=production `
  APP_URL=https://lotus-ledger.fly.dev `
  SESSION_SECRET=... `
  --app lotus-ledger
```

Register the production redirect URI in Intuit. Tokens should move to Postgres (encrypted) when the database is wired up — same pattern as planned for multiple Stripe keys.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Redirect URI mismatch | URI in Intuit must match `APP_URL` + `/integrations/quickbooks/callback` exactly |
| Invalid OAuth state | Retry connect; keep `SESSION_SECRET` stable |
| `Not connected` on API | Complete the Connect flow first |
| Sandbox empty invoices | Create test invoices in the sandbox company |

## Why not a plain API key?

Intuit deprecated key-only access for QBO. OAuth is mandatory for third-party apps. Make.com hides this by hosting the OAuth flow on their platform — we implement the same flow directly.
