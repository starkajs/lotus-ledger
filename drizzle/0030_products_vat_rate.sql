ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "vat_rate_percent" real DEFAULT 0 NOT NULL;
