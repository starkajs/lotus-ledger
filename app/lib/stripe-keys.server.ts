/** Stripe secret keys: sk_* (standard) or rk_* (restricted). Not publishable pk_* keys. */
const STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_/;

/**
 * Normalizes a key pasted from .env or the Stripe dashboard (quotes, whitespace, Bearer prefix).
 */
export function normalizeStripeSecretKey(raw: string): string {
  let key = raw.trim().replace(/\s+/g, "");

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/^Bearer\s+/i, "");

  return key;
}

export function isValidStripeSecretKey(key: string): boolean {
  return STRIPE_SECRET_KEY_PATTERN.test(key);
}

export function assertValidStripeSecretKey(key: string): void {
  if (isValidStripeSecretKey(key)) return;

  if (key.startsWith("pk_test_") || key.startsWith("pk_live_")) {
    throw new Error(
      "That is a publishable key (pk_). Paste the secret key (sk_ or rk_) from Stripe → Developers → API keys.",
    );
  }

  throw new Error(
    "Invalid Stripe secret key. Use a secret key starting with sk_test_, sk_live_, rk_test_, or rk_live_ (no quotes).",
  );
}
