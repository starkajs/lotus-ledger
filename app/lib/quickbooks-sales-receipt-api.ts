/** QuickBooks Online v3 Sales Receipt create — documented API contract. */

export const QUICKBOOKS_SALES_RECEIPT_MINOR_VERSION = 65;

export const QUICKBOOKS_SALES_RECEIPT_CREATE_API = {
  method: "POST" as const,
  pathTemplate: `/v3/company/{realmId}/salesreceipt?minorversion=${QUICKBOOKS_SALES_RECEIPT_MINOR_VERSION}`,
  productionBaseUrl: "https://quickbooks.api.intuit.com",
  sandboxBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
  auth: "Authorization: Bearer {access_token}",
  contentType: "application/json",
  requestBody:
    "Flat JSON object — not wrapped in { \"SalesReceipt\": … } for the POST body",
  response: "{ \"SalesReceipt\": { \"Id\", \"SyncToken\", … } }",
  implementedIn: "createQuickBooksSalesReceipt()",
} as const;

export const QUICKBOOKS_SALES_RECEIPT_CREATE_EXAMPLE = {
  TxnDate: "2026-04-15",
  TrackingNum: "pi_3ABC…",
  PaymentRefNum: "pi_3ABC…",
  CustomerRef: { value: "12", name: "Donations Stripe" },
  DepositToAccountRef: { value: "35" },
  PaymentMethodRef: { value: "8", name: "Credit card" },
  CustomerMemo: { value: "Thank you for your payment" },
  Line: [
    {
      DetailType: "SalesItemLineDetail",
      Amount: 120.0,
      Description: "Stripe charge",
      SalesItemLineDetail: {
        ItemRef: { value: "19", name: "Programme fee" },
        Qty: 1,
        UnitPrice: 120.0,
      },
    },
  ],
} as const;
