# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Integrations

### Authentication

See **[docs/auth-setup.md](docs/auth-setup.md)**. Users are invite-only: seed the first user with `npm run db:seed`, invite others via `/integrations/invite` or `npm run invite-user` (Resend email when configured). Set `SESSION_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL`, run migrations, then sign in at `/login`.

### Stripe

See **[docs/stripe-setup.md](docs/stripe-setup.md)**. After logging in, add Stripe secret keys at `/integrations/stripe` (encrypted in Postgres; multiple accounts supported).

### QuickBooks Online

See **[docs/quickbooks-setup.md](docs/quickbooks-setup.md)**. Intuit requires OAuth (no API key) — create an app in the developer portal, add credentials to `.env`, then **Connect QuickBooks** at `/integrations/quickbooks`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Fly.io (aptim-solutions)

**Start here:** **[docs/deploy-fly.md](docs/deploy-fly.md)** — create the app → deploy without a DB → create Fly Postgres → attach → run Drizzle migrations → add secrets.

Database: **Drizzle** (`app/db/schema.ts`, `drizzle/`). See **[docs/database-migrations.md](docs/database-migrations.md)** — always use `npm run db:generate` after schema changes (never add SQL without updating `drizzle/meta/_journal.json`). Do not run `db:migrate` until `DATABASE_URL` points at Fly Postgres (or a local proxy).

### Docker (local or other platforms)

```bash
docker build -t lotus-ledger .
docker run --rm -p 3000:3000 -e PORT=3000 lotus-ledger
```

The app listens on port **3000**. Health check: `http://localhost:3000/health`.

### Build output

```
├── package.json
├── package-lock.json
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
