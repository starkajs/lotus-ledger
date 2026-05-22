# WooCommerce orders

Synced from the [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/) (`/wp-json/wc/v3/orders`) using env credentials.

## Configuration

```env
WC_SITE=https://your-shop.example.com
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
```

Use a read-only API key where possible. No trailing slash on `WC_SITE`.

## Table: `woocommerce_orders`

| Column | Source |
|--------|--------|
| `wc_order_id` | WooCommerce order `id` (unique) |
| `order_number` | `number` |
| `status` | e.g. `completed`, `processing` |
| `currency`, `total_minor`, … | Amounts parsed to minor units |
| `date_created`, `date_paid`, … | Order timestamps |
| `payment_method`, `payment_method_title`, `transaction_id` | Payment fields |
| `billing_*` | Billing address / email |
| `line_items`, `line_summary` | Line items JSON + short summary |
| `wc_raw` | Full order JSON from the API |
| `community_member_id` | Linked by billing email |

## Community members

When `billing.email` is present, sync finds or creates a `community_members` row (same email normalization as Stripe). Name and address are filled when missing.

## Sync

```bash
npm run db:migrate
npm run sync:woocommerce-orders
```

Last 90 days by default. Options:

```bash
npm run sync:woocommerce-orders -- --days 30
npm run sync:woocommerce-orders -- --since 2024-01-01
```

Or use **Sync from WooCommerce** on `/integrations/woocommerce/orders`.

## UI

- `/integrations/woocommerce` — connection status
- `/integrations/woocommerce/orders` — paginated order list with status filter
