export function getStripeSecretKey(): string | undefined {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || undefined;
}

export function requireStripeSecretKey(): string {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env for local dev or Fly secrets for production.",
    );
  }
  return key;
}

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url || undefined;
}

export function getStripeMode(): "test" | "live" {
  const key = getStripeSecretKey() ?? "";
  return key.startsWith("sk_live_") ? "live" : "test";
}

/** Base URL only — e.g. http://localhost:5174 (not the OAuth callback path). */
export function getAppUrl(): string {
  let url = process.env.APP_URL?.trim() || "http://localhost:5173";
  url = url.replace(/\/$/, "");
  // APP_URL is sometimes set to the full callback URL by mistake
  url = url.replace(/\/integrations\/quickbooks\/callback$/i, "");
  return url;
}

export function getQuickBooksClientId(): string | undefined {
  return process.env.QUICKBOOKS_CLIENT_ID?.trim() || undefined;
}

export function getQuickBooksClientSecret(): string | undefined {
  return process.env.QUICKBOOKS_CLIENT_SECRET?.trim() || undefined;
}

export function getQuickBooksEnvironment(): "sandbox" | "production" {
  const env = process.env.QUICKBOOKS_ENVIRONMENT?.trim().toLowerCase();
  return env === "production" ? "production" : "sandbox";
}

export function isQuickBooksConfigured(): boolean {
  return Boolean(getQuickBooksClientId() && getQuickBooksClientSecret());
}

export function getOAuthStateSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    getQuickBooksClientSecret() ||
    "lotus-ledger-dev-secret"
  );
}
