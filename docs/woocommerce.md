# WooCommerce integration

Synced from the [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/) using `WC_*` env credentials.

## Configuration

```env
WC_SITE=https://your-shop.example.com
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
# WC_STORE_CURRENCY=gbp   # product prices (default gbp)
# WOO_SYNC_DAYS=90        # order sync window (CLI)
```

## Orders (`woocommerce_orders`)

When `billing.email` is present, sync **finds or creates** a `community_members` row (same as Stripe guest linking). Name and address from billing are merged when missing.

```bash
npm run sync:woocommerce-orders
npm run sync:woocommerce-orders -- --days 30
```

UI: `/integrations/woocommerce/orders` — sync button, status filter, order detail with raw JSON.

## Products (`woocommerce_products`)

Full product catalog (all statuses). Stores name, SKU, slug, prices, stock, categories, permalink, and raw JSON.

```bash
npm run sync:woocommerce-products
```

UI: `/integrations/woocommerce/products` — search, status filter, sync button.

## Hub

`/integrations/woocommerce` — connection status and counts.
