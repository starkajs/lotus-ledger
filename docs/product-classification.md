# Product classification

Each synced Stripe balance transaction maps to one **Lotus product**, which maps to one **QuickBooks item** when pushing.

## Tables

- `products` — catalog (`code`, `name`, `quickbooks_item_id`)
- `product_match_rules` — text/SKU rules with global `priority` (lower runs first)
- `stripe_balance_transactions` — `product_id`, `product_match_rule_id`, `product_match_status`, `product_matched_at`

## Rules

1. **WooCommerce order first** — a linked order with one Lotus product (an assignment on the order, or every mapped line agreeing) sets `product_match_status = woocommerce`. That product is what QuickBooks receives. Several different Lotus products on the order are left for a rule or a manual assignment.
2. **First match wins** — rules grouped by `priority`; first priority level with exactly one match assigns the product.
3. **Ambiguous** — two or more rules match at the same priority → no product assigned.
4. **Manual is sticky** — `product_match_status = manual` is not overwritten by sync or list Re-classify. **Re-classify** on the transaction detail page forces a new match. Saving a rule from a transaction does not change manual rows.
5. **Saving a rule maps unmatched rows** — the transaction detail page can save the charge text as a rule (priority 50) and immediately classify unmatched transactions. Sync classifies new charges.
6. **Already in QuickBooks** — once `pushed_to_quickbooks` is true, sync, Re-classify, rules, WooCommerce order mapping, and manual assignment do not change `product_id`. The QuickBooks receipt stays aligned with Lotus Ledger.
7. **QuickBooks push** requires `product_id` and `products.quickbooks_item_id`.

## Classification text sources

From balance `description` and expanded charge `source` in `stripe_raw`:

- `balance_description`, `charge_description`
- `metadata["Line Item 1"]`, `metadata["line_items_summary"]`, `donorbox_metadata`
- `metadata_all`, `sku` (stored `sku` column or charge metadata `sku` / `SKU` / `product_sku` when Stripe adds it; bracket codes in line items remain on the `sku` rule field via line item text)

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
- Transaction detail — save a match rule, manual assign, apply the WooCommerce order product, Re-classify, QB readiness
