# Product classification

Each synced Stripe balance transaction maps to one **Lotus product**, which maps to one **QuickBooks item** when pushing.

## Tables

- `products` — catalog (`code`, `name`, `quickbooks_item_id`)
- `product_match_rules` — text/SKU rules with global `priority` (lower runs first)
- `stripe_balance_transactions` — `product_id`, `product_match_rule_id`, `product_match_status`, `product_matched_at`

## Rules

1. **First match wins** — rules grouped by `priority`; first priority level with exactly one match assigns the product.
2. **Ambiguous** — two or more rules match at the same priority → no product assigned.
3. **Manual is sticky** — `product_match_status = manual` is not overwritten by sync or Re-classify (unmatched only). Use **Re-classify** on the transaction detail page with force to overwrite manual.
4. **QuickBooks push** requires `product_id` and `products.quickbooks_item_id`.

## Classification text sources

From balance `description` and expanded charge `source` in `stripe_raw`:

- `balance_description`, `charge_description`
- `metadata["Line Item 1"]`, `metadata["line_items_summary"]`, `donorbox_metadata`
- `metadata_all`, `sku` (from line item fields)

## Commands

```bash
npm run db:migrate
npm run sync:stripe-transactions          # classifies after each upsert
npm run classify:stripe-transactions        # re-run rules on existing rows
npm run classify:stripe-transactions -- --unmatched-only
npm run classify:stripe-transactions -- --force
```

## UI

- `/products` — manage catalog and QuickBooks item IDs
- `/products/rules` — match rules + sample text tester
- Stripe transactions list — Product column and filters
- Transaction detail — manual assign, Re-classify, QB readiness
