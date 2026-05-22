# Stripe balance transactions

Synced from Stripe’s [Balance Transaction](https://docs.stripe.com/api/balance_transactions/object) API (`txn_…`), one row per transaction per saved Stripe account.

## Table: `stripe_balance_transactions`

| Column | Source / notes |
|--------|----------------|
| `stripe_balance_transaction_id` | Stripe `id` (`txn_…`) |
| `amount`, `net`, `fee` | Minor units (cents), signed integers from Stripe |
| `currency` | Lowercase ISO code |
| `type` | e.g. `charge`, `refund`, `payout` |
| `status` | e.g. `available`, `pending` |
| `description` | Stripe description |
| `source_id` | Linked object id (`ch_…`, etc.) |
| `stripe_payment_intent_id` | `pi_…` from expanded charge / payment_intent (matches QuickBooks tracking # historically) |
| `reporting_category` | Stripe reporting category |
| `available_on` | When funds are available |
| `stripe_created_at` | Stripe `created` |
| `stripe_customer_id` | `cus_…` from the transaction source (when present) |
| `community_member_id` | FK to `community_members` (created on sync if missing) |
| `stripe_raw` | Full Stripe Balance Transaction JSON from the API |
| `pushed_to_quickbooks` | App flag (default `false`) |
| `quickbooks_pushed_at` | Set when pushed (future) |

Unique on `(stripe_connection_id, stripe_balance_transaction_id)`.

Re-sync updates amounts/status/raw JSON but does **not** clear `pushed_to_quickbooks`.

### Sync filter (posted only)

Imports only balance transactions that are **posted**:

- `status === "available"` (on the Stripe balance, not pending)
- When `source` is expanded: underlying `charge` / `payment` must have succeeded

Pending or failed activity is skipped (`skippedNotPosted` in sync output).

When a transaction has a Stripe customer, sync finds or creates the matching community member (by email) and links the row.

## Sync

```bash
npm run db:migrate
npm run sync:stripe-transactions
```

Single account:

```bash
npm run sync:stripe-transactions -- --connection <uuid>
```

Last 30 days only (testing):

```bash
npm run sync:stripe-transactions -- --days 30
```

Or set `STRIPE_SYNC_DAYS=30` in `.env` for CLI runs without `--days`. On the transactions page, tick **Last 30 days only** before syncing.

Or use **Sync from Stripe** on `/integrations/stripe/transactions`.

### Clear all (re-import)

```bash
npm run clear:stripe-transactions -- --confirm
```

Then sync again.

### Backfill payment intent ids (existing rows)

```bash
npm run db:migrate
npm run backfill:stripe-payment-intents
```

Reads `stripe_raw` only (no Stripe API). New syncs populate the column automatically.

## UI

`/integrations/stripe/transactions` — paginated table with QuickBooks filter (all / pushed / not pushed).
