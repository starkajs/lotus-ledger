# Stripe → QuickBooks (Sales Receipt push)

Lotus Ledger pushes eligible **Stripe balance transactions** into QuickBooks as **Sales Receipts** (`SalesReceipt` entity).

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

## Field mapping

| QuickBooks field | Source |
|------------------|--------|
| `CustomerRef` | **Stripe connection** → `quickbooks_customer_id` |
| `DepositToAccountRef` | **Stripe connection** → `quickbooks_deposit_account_id` |
| `PaymentMethodRef` | **Stripe connection** → `quickbooks_payment_method_id` |
| `PaymentRefNum` | Stripe connection template (default `{{payment_intent_id}}`) |
| `CustomerMemo` | **Community member email** (Stripe connection message template only if no member email) |
| `BillEmail` | Same as member email when linked |
| `Line[].Description` | Stripe transaction description (charge, else balance) |
| `TrackingNum` | `stripe_payment_intent_id` (`pi_…`) |
| `TxnDate` | `stripe_created_at` (Europe/London calendar date) |
| `Line[].SalesItemLineDetail.ItemRef` | Lotus **product** → `products.quickbooks_item_id` |
| `Line[].Amount` / `UnitPrice` | Stripe **`amount` (gross)**; if Lotus product `vat_rate_percent` > 0, line net = gross ÷ (1 + VAT/100) so QB can add VAT on top |
| `Line[].SalesItemLineDetail.TaxCodeRef` | Lotus **product** → `quickbooks_tax_code_id` (QB item tax code is fallback only) |
| `GlobalTaxCalculation` | `TaxExcluded` (line amounts are net ex-VAT when VAT applies) |
| `Line[].SalesItemLineDetail.ItemAccountRef` | Synced QB item **income account** |
| `Line[].SalesItemLineDetail.ClassRef` | Synced QB item **class** |
| `ClassRef` (header) | Same as line class when present on item |
| `PrivateNote` | `{product_code} · {product_name} \| LL {lotus_transaction_id}` (product first for QB visibility) |

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
7. Lotus product has **QuickBooks VAT code** set (sync at `/integrations/quickbooks/tax-codes`).

## Configuration layers

| Layer | UI | Purpose |
|-------|-----|---------|
| Stripe ↔ QB | Integrations → Stripe (per account) | QB customer, deposit, payment method, ref/memo templates |
| Product | `/products` | Code, QB item id, **VAT %**, **QB VAT code** |
| Product match | `/products/rules` | Which Lotus product |
| QB VAT codes | `/integrations/quickbooks/tax-codes` | Sync TaxCode list from QuickBooks |

## Dry run & test push

`planStripeQuickBooksPushForTransaction()` builds the Sales Receipt JSON from Stripe account mapping + Lotus product.

`pushStripeBalanceTransactionToQuickBooks()` POSTs to QuickBooks, stores `quickbooks_sales_receipt_id`, and returns the raw API response (preview UI at `/integrations/stripe/transactions/quickbooks-push`).

## Reconciliation link

After a successful create, persist QuickBooks `SalesReceipt.Id` on the Stripe row:

| Lotus column | QuickBooks |
|--------------|------------|
| `stripe_balance_transactions.quickbooks_sales_receipt_id` | `SalesReceipt.Id` |

Also set `pushed_to_quickbooks = true` and `quickbooks_pushed_at`. Use `setStripeBalanceTransactionQuickBooksSalesReceipt()` from `app/lib/stripe-balance-transactions.server.ts`.

Secondary match: `quickbooks_sales_receipts.tracking_num` = `stripe_payment_intent_id` (`pi_…`), and synced receipts link from the transaction detail when the receipt row exists.

Reverse lookup: `getStripeBalanceTransactionByQuickBooksSalesReceiptId()` / `getQuickBooksSalesReceiptByQuickbooksId()`.

On successful push, if the receipt is not yet in `quickbooks_sales_receipts`, Lotus imports it from the API response (`upsertQuickBooksSalesReceiptFromApi()`).

**Clear pushed flag:** `clearStripeBalanceTransactionQuickBooksPush()` sets `pushed_to_quickbooks = false`, clears `quickbooks_pushed_at` and `quickbooks_sales_receipt_id` (does not delete the synced QB receipt row). Available on the transaction detail page and the push preview page.

## Related code

- `app/lib/stripe-quickbooks-push-plan.server.ts`
- `app/lib/stripe-quickbooks-push-execute.server.ts`
- `app/lib/quickbooks-api-write.server.ts` — `createQuickBooksSalesReceiptDetailed()`
- `app/lib/stripe-quickbooks-push-amount.ts`
- `app/lib/stripe-connections-quickbooks.server.ts`
- `app/lib/quickbooks-master-data.server.ts` — `getQuickBooksItemPushDefaults()`
