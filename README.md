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

### Stripe

See **[docs/stripe-setup.md](docs/stripe-setup.md)**. Add `STRIPE_SECRET_KEY` to `.env`, then open `/integrations/stripe` to verify transactions load. Multiple accounts via encrypted DB storage is planned next.

### QuickBooks Online

See **[docs/quickbooks-setup.md](docs/quickbooks-setup.md)**. Intuit requires OAuth (no API key) — create an app in the developer portal, add credentials to `.env`, then **Connect QuickBooks** at `/integrations/quickbooks`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Fly.io (aptim-solutions)

Lotus Ledger is configured for Fly.io with `fly.toml`, a production `Dockerfile`, and a `/health` check endpoint.

See **[docs/deploy-fly.md](docs/deploy-fly.md)** for step-by-step instructions: launch the app in `aptim-solutions`, create Managed Postgres, attach `DATABASE_URL`, and deploy.

Quick deploy (after Postgres is attached):

```bash
fly deploy --app lotus-ledger
```

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
