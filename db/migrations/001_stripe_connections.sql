-- Reserved for multiple Stripe accounts (encrypted secret keys per row).
-- Not required while using STRIPE_SECRET_KEY in .env for validation.

CREATE TABLE IF NOT EXISTS stripe_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_account_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scope TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  business_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_connections_stripe_account_id_idx
  ON stripe_connections (stripe_account_id);
