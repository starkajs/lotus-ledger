/**
 * QuickBooks Online v3 Refund Receipt — create payload shape.
 * @see https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/refundreceipt
 */

import type {
  QuickBooksRef,
  QuickBooksSalesReceiptLine,
} from "~/lib/quickbooks-sales-receipt-create";

/** Body for POST /v3/company/{realmId}/refundreceipt?minorversion=65 */
export type QuickBooksRefundReceiptCreate = {
  GlobalTaxCalculation?: "TaxExcluded" | "TaxInclusive" | "NotApplicable";
  TxnDate: string;
  TrackingNum?: string;
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

export type QuickBooksRefundReceiptCreateResponse = {
  RefundReceipt: QuickBooksRefundReceiptCreate & {
    Id: string;
    SyncToken: string;
    DocNumber?: string;
    TotalAmt?: number;
  };
};
