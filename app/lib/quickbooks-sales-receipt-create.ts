/**
 * QuickBooks Online v3 Sales Receipt — create payload shape.
 * @see docs/quickbooks-stripe-push.md
 * @see https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/salesreceipt
 */

export type QuickBooksRef = {
  value: string;
  name?: string;
};

export type QuickBooksSalesItemLineDetail = {
  ItemRef: QuickBooksRef;
  Qty?: number;
  UnitPrice?: number;
  /** Income account from the QB item when overriding defaults. */
  ItemAccountRef?: QuickBooksRef;
  TaxCodeRef?: QuickBooksRef;
  ClassRef?: QuickBooksRef;
};

export type QuickBooksSalesReceiptLine = {
  DetailType: "SalesItemLineDetail";
  Amount: number;
  Description?: string;
  SalesItemLineDetail: QuickBooksSalesItemLineDetail;
};

/** Body for POST /v3/company/{realmId}/salesreceipt?minorversion=65 */
export type QuickBooksSalesReceiptCreate = {
  TxnDate: string;
  /** Payment intent id — matches synced `tracking_num` on imported receipts. */
  TrackingNum?: string;
  /** Reference number for the payment (QB “Reference no”). */
  PaymentRefNum?: string;
  CustomerRef?: QuickBooksRef;
  BillEmail?: { Address: string };
  DepositToAccountRef: QuickBooksRef;
  PaymentMethodRef?: QuickBooksRef;
  ClassRef?: QuickBooksRef;
  CurrencyRef?: QuickBooksRef;
  PrivateNote?: string;
  CustomerMemo?: { value: string };
  Line: QuickBooksSalesReceiptLine[];
};

export type QuickBooksSalesReceiptCreateResponse = {
  SalesReceipt: QuickBooksSalesReceiptCreate & {
    Id: string;
    SyncToken: string;
    DocNumber?: string;
    TotalAmt?: number;
  };
};
