# Stripe → QuickBooks (Sales Receipt push)

Lotus Ledger pushes eligible **Stripe balance transactions** into QuickBooks as **Sales Receipts** (`SalesReceipt` entity). Today the app **imports** sales receipts from QuickBooks but does **not** create them yet. This document is the mapping contract.

## API signature

| Item | Value |
|------|--------|
| Method | `POST` |
| URL | `{baseUrl}/v3/company/{realmId}/salesreceipt?minorversion=65` |
| `baseUrl` | Production: `https://quickbooks.api.intuit.com` · Sandbox: `https://sandbox-quickbooks.api.intuit.com` |
| Auth | `Authorization: Bearer {access_token}` (via `intuit-oauth` client) |
| Content-Type | `application/json` |
| Request body | JSON object — **not** wrapped in `{ "SalesReceipt": … }` for the POST body |
| Response | `{ "SalesReceipt": { "Id", "SyncToken", … } } }` |

Implemented in `app/lib/quickbooks-api-write.server.ts` as `createQuickBooksSalesReceipt()`.

## Field mapping (current plan)

| QuickBooks field | Source |
|------------------|--------|
| `CustomerRef` | **Stripe connection** → `quickbooks_customer_id` |
| `DepositToAccountRef` | **Stripe connection** → `quickbooks_deposit_account_id` |
| `PaymentMethodRef` | **Stripe connection** → `quickbooks_payment_method_id` |
| `PaymentRefNum` | Stripe connection template (default `{{payment_intent_id}}`) |
| `CustomerMemo` | Stripe connection message template |
| `TrackingNum` | `stripe_payment_intent_id` (`pi_…`) |
| `TxnDate` | `stripe_created_at` (Europe/London calendar date) |
| `Line[].SalesItemLineDetail.ItemRef` | Lotus **product** → `products.quickbooks_item_id` |
| `Line[].Amount` / `UnitPrice` | Stripe **`amount` (gross)**; if Lotus product `vat_rate_percent` > 0, line net = gross ÷ (1 + VAT/100) so QB can add VAT on top |
| `Line[].SalesItemLineDetail.TaxCodeRef` | Synced **QB item** `SalesTaxCodeRef` (push-rule override optional) |
| `Line[].SalesItemLineDetail.ItemAccountRef` | Synced QB item **income account** |
| `Line[].SalesItemLineDetail.ClassRef` | Synced QB item **class** |
| `ClassRef` (header) | Same as line class when present on item |
| `PrivateNote` | Push rule template (optional) |

### Amount logic

- Stripe balance `amount` is treated as **gross** (what the customer paid, including VAT when applicable).
- QuickBooks UK applies VAT on top of the line **net** when `TaxCodeRef` is set.
- Example: gross £120, VAT 20% → line amount **£100**; QB calculates £20 VAT.

### Prerequisites

1. Transaction on or after QuickBooks cutoff (`pushed_to_quickbooks` not `null`).
2. Not already pushed.
3. Lotus **product** assigned with `quickbooks_item_id`.
4. Stripe account has **QuickBooks customer**, **deposit to**, and **payment method** mapped.
5. Reference / message templates configured on the Stripe account (reference defaults to payment intent id).
6. Synced QB item exists (refresh **Products & services**).
7. When `vat_rate_percent` > 0: QB item must have a tax code.
8. A matching **push rule** (for notes / deposit fallback; matching still required today).

## Rule layers

| Layer | UI | Purpose |
|-------|-----|---------|
| Stripe ↔ QB | Integrations → Stripe (per account) | QB customer + deposit account |
| Product | `/products` | Code, QB item id, **VAT %** |
| Product match | `/products/rules` | Which Lotus product |
| QB push rules | `/integrations/stripe/transactions/quickbooks-push` | Match txn text; optional deposit fallback, note templates |

**First matching push rule wins** (lowest priority number first).

## Dry run

`planStripeQuickBooksPushForTransaction()` returns proposed JSON, gross vs line amounts, VAT %, issues, and `ready`.

## Reconciliation link

After a successful create, persist QuickBooks `SalesReceipt.Id` on the Stripe row:

| Lotus column | QuickBooks |
|--------------|------------|
| `stripe_balance_transactions.quickbooks_sales_receipt_id` | `SalesReceipt.Id` |

Also set `pushed_to_quickbooks = true` and `quickbooks_pushed_at`. Use `setStripeBalanceTransactionQuickBooksSalesReceipt()` from `app/lib/stripe-balance-transactions.server.ts`.

Secondary match: `quickbooks_sales_receipts.tracking_num` = `stripe_payment_intent_id` (`pi_…`), and synced receipts link from the transaction detail when the receipt row exists.

Reverse lookup: `getStripeBalanceTransactionByQuickBooksSalesReceiptId()` / `getQuickBooksSalesReceiptByQuickbooksId()`.

## Related code

- `app/lib/stripe-quickbooks-push-plan.server.ts`
- `app/lib/stripe-quickbooks-push-amount.ts`
- `app/lib/stripe-connections-quickbooks.server.ts`
- `app/lib/quickbooks-master-data.server.ts` — `getQuickBooksItemPushDefaults()`
