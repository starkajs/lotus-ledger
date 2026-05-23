import { calendarDateFromInstant } from "~/lib/date-range-filters";
import { minorUnitsToMajor } from "~/lib/money";
import type { QuickBooksItemPushDefaults } from "~/lib/quickbooks-master-data.server";
import {
  getQuickBooksItemPushDefaults,
  listQuickBooksPaymentMethods,
  listQuickBooksTaxCodes,
} from "~/lib/quickbooks-master-data.server";
import type { QuickBooksSalesReceiptCreate } from "~/lib/quickbooks-sales-receipt-create";
import {
  resolveStripeQuickBooksPushTaxCode,
  type QuickBooksPushTaxCodeSource,
} from "~/lib/quickbooks-tax-code";
import { canPushTransactionToQuickbooks } from "~/lib/product-classification.server";
import type { StripeConnectionQuickBooksMapping } from "~/lib/stripe-connections-quickbooks.server";
import {
  DEFAULT_STRIPE_QB_PAYMENT_REF_TEMPLATE,
  getStripeConnectionQuickBooksMapping,
} from "~/lib/stripe-connections-quickbooks.server";
import { stripeGrossToQuickBooksLineAmount } from "~/lib/stripe-quickbooks-push-amount";
import type { StripeBalanceTransactionRecord } from "~/lib/stripe-balance-transactions.server";
import { getProductById } from "~/lib/products.server";
import { extractStripeTransactionProductSignals } from "~/lib/stripe-transaction-signals";

function lotusProductLabelForPrivateNote(
  productCode: string | null | undefined,
  productName: string | null | undefined,
): string {
  const code = productCode?.trim();
  const name = productName?.trim();
  if (code && name && code !== name) return `${code} · ${name}`;
  return code || name || "—";
}

function defaultPrivateNoteForLotusPush(
  lotusTransactionId: string,
  productCode: string | null | undefined,
  productName: string | null | undefined,
): string {
  const product = lotusProductLabelForPrivateNote(productCode, productName);
  return `${product} | LL ${lotusTransactionId}`;
}

export type StripeQuickBooksPushPlan = {
  salesReceipt: QuickBooksSalesReceiptCreate | null;
  /** Stripe gross (customer paid). */
  grossAmountMajor: number | null;
  /** Net line amount sent to QuickBooks (ex-VAT when VAT applies). */
  lineAmountMajor: number | null;
  vatRatePercent: number;
  currency: string | null;
  taxCodeId: string | null;
  taxCodeSource: QuickBooksPushTaxCodeSource | null;
  issues: string[];
  ready: boolean;
};

function applyTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/** Stripe charge/balance description for the Sales Receipt line. */
function stripeDescriptionForSalesReceiptLine(
  transaction: Pick<
    StripeBalanceTransactionRecord,
    "description" | "stripeRaw" | "sku" | "productCode"
  >,
): string {
  const signals = extractStripeTransactionProductSignals({
    stripeRaw: transaction.stripeRaw,
    description: transaction.description,
    sku: transaction.sku,
  });
  const fromStripe =
    signals.description?.trim() ||
    signals.chargeDescription?.trim() ||
    signals.balanceDescription?.trim() ||
    transaction.description?.trim();
  return fromStripe || transaction.productCode?.trim() || "Sale";
}

export function planStripeQuickBooksPush(input: {
  transaction: Pick<
    StripeBalanceTransactionRecord,
    | "id"
    | "stripeConnectionId"
    | "stripeBalanceTransactionId"
    | "amount"
    | "net"
    | "fee"
    | "currency"
    | "type"
    | "description"
    | "reportingCategory"
    | "stripeRaw"
    | "sku"
    | "stripeCreatedAt"
    | "stripePaymentIntentId"
    | "orderKey"
    | "wcOrderId"
    | "productId"
    | "productCode"
    | "productName"
    | "productQuickbooksItemId"
    | "productQuickbooksTaxCodeId"
    | "productVatRatePercent"
    | "pushedToQuickbooks"
    | "memberEmail"
  >;
  stripeQb: StripeConnectionQuickBooksMapping | null;
  qbItem: QuickBooksItemPushDefaults | null;
}): StripeQuickBooksPushPlan {
  const issues: string[] = [];
  const pushCheck = canPushTransactionToQuickbooks(input.transaction);
  if (!pushCheck.ok) {
    issues.push(pushCheck.reason);
  }

  if (!input.transaction.productQuickbooksItemId) {
    issues.push("Product has no QuickBooks item mapped");
  }

  if (!input.qbItem) {
    issues.push(
      "QuickBooks item not found — refresh Products & services in QuickBooks",
    );
  }

  const customerId =
    input.stripeQb?.quickbooksCustomerId?.trim() || null;
  if (!customerId) {
    issues.push(
      "Stripe account has no QuickBooks customer — set it on Integrations → Stripe",
    );
  }

  const depositAccountId =
    input.stripeQb?.quickbooksDepositAccountId?.trim() || null;
  if (!depositAccountId) {
    issues.push(
      "Stripe account has no QuickBooks deposit account — set it on Integrations → Stripe",
    );
  }

  const paymentMethodId =
    input.stripeQb?.quickbooksPaymentMethodId?.trim() || null;
  if (!paymentMethodId) {
    issues.push(
      "Stripe account has no QuickBooks payment method — set it on Integrations → Stripe",
    );
  }

  const vatRatePercent = input.transaction.productVatRatePercent;
  const amounts = stripeGrossToQuickBooksLineAmount({
    grossMinor: input.transaction.amount,
    currency: input.transaction.currency,
    vatRatePercent,
  });

  const taxResolved = resolveStripeQuickBooksPushTaxCode({
    productTaxCodeId: input.transaction.productQuickbooksTaxCodeId,
    itemSalesTaxCodeId: input.qbItem?.salesTaxCodeRef ?? null,
  });

  if (!taxResolved.taxCodeId) {
    issues.push(
      "Lotus product has no QuickBooks VAT code — set it on Products (sync VAT codes under Integrations → QuickBooks → VAT codes)",
    );
  }

  const txnDate = calendarDateFromInstant(
    new Date(input.transaction.stripeCreatedAt),
  );

  const templateVars = {
    lotus_transaction_id: input.transaction.id,
    stripe_balance_transaction_id: input.transaction.stripeBalanceTransactionId,
    payment_intent_id: input.transaction.stripePaymentIntentId ?? "",
    order_key: input.transaction.orderKey ?? "",
    wc_order_id:
      input.transaction.wcOrderId != null
        ? String(input.transaction.wcOrderId)
        : "",
    product_code: input.transaction.productCode ?? "",
    member_email: input.transaction.memberEmail ?? "",
    fee: minorUnitsToMajor(input.transaction.fee, input.transaction.currency),
  };

  const lineDescription = stripeDescriptionForSalesReceiptLine(input.transaction);

  const paymentRefTemplate =
    input.stripeQb?.quickbooksPaymentRefTemplate?.trim() ||
    DEFAULT_STRIPE_QB_PAYMENT_REF_TEMPLATE;
  const paymentRefNum = applyTemplate(paymentRefTemplate, templateVars).trim();

  const customerMemoTemplate =
    input.stripeQb?.quickbooksCustomerMemoTemplate?.trim() || "";
  const memberEmail = input.transaction.memberEmail?.trim() || "";
  const customerMemo =
    memberEmail ||
    (customerMemoTemplate
      ? applyTemplate(customerMemoTemplate, templateVars).trim()
      : "");

  const privateNote = defaultPrivateNoteForLotusPush(
    input.transaction.id,
    input.transaction.productCode,
    input.transaction.productName,
  );

  const lineDetail: QuickBooksSalesReceiptCreate["Line"][0]["SalesItemLineDetail"] =
    {
      ItemRef: {
        value: input.transaction.productQuickbooksItemId ?? "",
        name: input.qbItem?.name ?? input.transaction.productName ?? undefined,
      },
      Qty: 1,
      UnitPrice: amounts.lineAmountMajor,
    };

  if (input.qbItem?.incomeAccountRef) {
    lineDetail.ItemAccountRef = { value: input.qbItem.incomeAccountRef };
  }

  if (input.qbItem?.quickbooksClassRef) {
    lineDetail.ClassRef = {
      value: input.qbItem.quickbooksClassRef,
      name: input.qbItem.quickbooksClassName ?? undefined,
    };
  }

  if (taxResolved.taxCodeId) {
    lineDetail.TaxCodeRef = { value: taxResolved.taxCodeId };
  }

  const salesReceipt: QuickBooksSalesReceiptCreate = {
    GlobalTaxCalculation: "TaxExcluded",
    TxnDate: txnDate,
    TrackingNum: input.transaction.stripePaymentIntentId ?? undefined,
    PaymentRefNum: paymentRefNum || undefined,
    CustomerRef: customerId ? { value: customerId } : undefined,
    DepositToAccountRef: { value: depositAccountId ?? "" },
    PaymentMethodRef: paymentMethodId ? { value: paymentMethodId } : undefined,
    CustomerMemo: customerMemo ? { value: customerMemo } : undefined,
    BillEmail: memberEmail ? { Address: memberEmail } : undefined,
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: amounts.lineAmountMajor,
        Description: lineDescription,
        SalesItemLineDetail: lineDetail,
      },
    ],
    PrivateNote: privateNote,
  };

  if (input.qbItem?.quickbooksClassRef) {
    salesReceipt.ClassRef = {
      value: input.qbItem.quickbooksClassRef,
      name: input.qbItem.quickbooksClassName ?? undefined,
    };
  }

  if (!input.transaction.stripePaymentIntentId) {
    issues.push("No payment intent id — TrackingNum will be omitted");
  }

  const ready = issues.length === 0 && pushCheck.ok;

  return {
    salesReceipt,
    grossAmountMajor: amounts.grossMajor,
    lineAmountMajor: amounts.lineAmountMajor,
    vatRatePercent,
    currency: input.transaction.currency,
    taxCodeId: taxResolved.taxCodeId,
    taxCodeSource: taxResolved.source,
    issues,
    ready,
  };
}

export async function planStripeQuickBooksPushForTransaction(input: {
  transaction: Parameters<typeof planStripeQuickBooksPush>[0]["transaction"];
}): Promise<StripeQuickBooksPushPlan> {
  const [stripeQb, qbItem, product, { taxCodes }, { paymentMethods }] =
    await Promise.all([
      getStripeConnectionQuickBooksMapping(input.transaction.stripeConnectionId),
      getQuickBooksItemPushDefaults(input.transaction.productQuickbooksItemId),
      input.transaction.productId
        ? getProductById(input.transaction.productId)
        : Promise.resolve(null),
      listQuickBooksTaxCodes(),
      listQuickBooksPaymentMethods(),
    ]);

  const transaction = {
    ...input.transaction,
    productVatRatePercent:
      input.transaction.productVatRatePercent ??
      product?.vatRatePercent ??
      0,
    productQuickbooksTaxCodeId:
      input.transaction.productQuickbooksTaxCodeId ??
      product?.quickbooksTaxCodeId ??
      null,
  };

  const plan = planStripeQuickBooksPush({
    transaction,
    stripeQb,
    qbItem,
  });

  const salesReceipt = plan.salesReceipt;
  if (!salesReceipt) return plan;

  if (plan.taxCodeId) {
    const match = taxCodes.find((t) => t.quickbooksId === plan.taxCodeId);
    if (match && salesReceipt.Line[0]?.SalesItemLineDetail.TaxCodeRef) {
      salesReceipt.Line[0].SalesItemLineDetail.TaxCodeRef.name = match.name;
    }
  }

  if (plan.salesReceipt?.PaymentMethodRef?.value) {
    const pm = paymentMethods.find(
      (p) => p.quickbooksId === plan.salesReceipt!.PaymentMethodRef!.value,
    );
    if (pm) {
      plan.salesReceipt.PaymentMethodRef.name = pm.name;
    }
  }

  return plan;
}
