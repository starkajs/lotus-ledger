-- Remove duplicate rows if unique constraint was missing or bypassed (keep oldest per realm + QB Id).
DELETE FROM "quickbooks_sales_receipts" AS dup
WHERE dup.id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY realm_id, quickbooks_id
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM "quickbooks_sales_receipts"
  ) ranked
  WHERE rn > 1
);
