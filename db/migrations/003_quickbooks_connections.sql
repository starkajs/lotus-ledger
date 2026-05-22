-- QuickBooks OAuth tokens (migrate from .data/quickbooks-tokens.json when ready)

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT,
  expires_in INTEGER,
  refresh_token_expires_in INTEGER,
  livemode BOOLEAN NOT NULL DEFAULT false,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
