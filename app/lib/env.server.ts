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

export function getResendApiKey(): string | undefined {
  return (
    process.env.RESEND_API_KEY?.trim() ||
    process.env.resend_api_key?.trim() ||
    undefined
  );
}

export function getResendFromAddress(): string | undefined {
  const raw =
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.FROM_EMAIL?.trim() ||
    undefined;
  if (!raw) return undefined;
  // Strip surrounding quotes from .env copy-paste (e.g. "Name <a@b.com>")
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export function requireResendFromAddress(): string {
  const from = getResendFromAddress();
  if (!from) {
    throw new Error(
      "RESEND_FROM is not set (e.g. Lotus Ledger <andrew@jamyang.co.uk>)",
    );
  }
  return from;
}

export function isResendConfigured(): boolean {
  return Boolean(getResendApiKey() && getResendFromAddress());
}

export function getWooCommerceSiteUrl(): string | undefined {
  const raw = process.env.WC_SITE?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

export function getWooCommerceConsumerKey(): string | undefined {
  return process.env.WC_CONSUMER_KEY?.trim() || undefined;
}

export function getWooCommerceConsumerSecret(): string | undefined {
  return process.env.WC_CONSUMER_SECRET?.trim() || undefined;
}

export function isWooCommerceConfigured(): boolean {
  return Boolean(
    getWooCommerceSiteUrl() &&
      getWooCommerceConsumerKey() &&
      getWooCommerceConsumerSecret(),
  );
}

/** Store currency for WooCommerce product prices (ISO code, lowercase). */
export function getWooCommerceStoreCurrency(): string {
  const raw = process.env.WC_STORE_CURRENCY?.trim().toLowerCase();
  return raw || "gbp";
}

export function requireWooCommerceConfig(): {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
} {
  const siteUrl = getWooCommerceSiteUrl();
  const consumerKey = getWooCommerceConsumerKey();
  const consumerSecret = getWooCommerceConsumerSecret();
  if (!siteUrl || !consumerKey || !consumerSecret) {
    throw new Error(
      "WooCommerce is not configured. Set WC_SITE, WC_CONSUMER_KEY, and WC_CONSUMER_SECRET in .env.",
    );
  }
  return { siteUrl, consumerKey, consumerSecret };
}

export function getOAuthStateSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  const qb = getQuickBooksClientSecret();
  if (qb) return qb;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "lotus-ledger-dev-secret";
}
