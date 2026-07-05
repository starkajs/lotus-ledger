import {
  runIntegrationJob,
  type IntegrationAuditContext,
} from "~/lib/integration-jobs.server";
import { calendarDateFromInstant } from "~/lib/date-range-filters";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import {
  syncQuickBooksRefundReceipts,
  type QuickBooksRefundReceiptSyncResult,
} from "~/lib/quickbooks-refund-receipts.server";
import {
  syncQuickBooksSalesReceipts,
  type QuickBooksSalesReceiptSyncResult,
} from "~/lib/quickbooks-sales-receipts.server";
import {
  listAllStripeBalanceTransactions,
} from "~/lib/stripe-balance-transactions.server";
import {
  pushStripeBalanceTransactionsBulkToQuickBooks,
  type StripeQuickBooksBulkPushResult,
} from "~/lib/stripe-quickbooks-push-execute.server";
import {
  syncStripeBalanceTransactions,
  type SyncStripeTransactionsResult,
} from "~/lib/sync-stripe-transactions.server";
import { WOOCOMMERCE_ORDER_APP_SYNC_DAYS } from "~/lib/woocommerce-orders.constants";
import { requireWooCommerceConfig } from "~/lib/env.server";
import {
  syncWooCommerceOrders,
  type SyncWooCommerceOrdersResult,
} from "~/lib/sync-woocommerce-orders.server";
import {
  syncWooCommerceProductsFromApi,
} from "~/lib/woocommerce-products.server";

export type SyncIntegrationsCronOptions = {
  wooDays?: number;
  stripeDays?: number;
  /** Stripe transactions on or after this calendar date are eligible for QB push. Defaults to stripeDays window. */
  qbPushDays?: number;
  audit?: IntegrationAuditContext;
};

export type SyncIntegrationsCronQuickBooksResult = {
  stripePush: StripeQuickBooksBulkPushResult;
  salesReceipts: QuickBooksSalesReceiptSyncResult;
  refundReceipts: QuickBooksRefundReceiptSyncResult;
};

export type SyncIntegrationsCronResult = {
  woocommerce: {
    orders: SyncWooCommerceOrdersResult;
    products: { created: number; updated: number };
  };
  stripe: SyncStripeTransactionsResult;
  quickbooks: SyncIntegrationsCronQuickBooksResult;
};

function resolveWooDays(options: SyncIntegrationsCronOptions): number {
  const fromEnv = Number(process.env.CRON_WOO_SYNC_DAYS ?? process.env.WOO_SYNC_DAYS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return options.wooDays ?? WOOCOMMERCE_ORDER_APP_SYNC_DAYS;
}

function resolveStripeDays(options: SyncIntegrationsCronOptions): number {
  const fromEnv = Number(process.env.CRON_STRIPE_SYNC_DAYS ?? process.env.STRIPE_SYNC_DAYS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return options.stripeDays ?? 30;
}

function resolveQbPushDays(
  options: SyncIntegrationsCronOptions,
  stripeDays: number,
): number {
  const fromEnv = Number(process.env.CRON_QB_PUSH_DAYS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return options.qbPushDays ?? stripeDays;
}

function calendarDateDaysAgo(days: number): string {
  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  return calendarDateFromInstant(since);
}

async function syncIntegrationsCronInner(
  options: SyncIntegrationsCronOptions,
): Promise<SyncIntegrationsCronResult> {
  const audit: IntegrationAuditContext = options.audit ?? { triggeredBy: "cli" };
  const wooDays = resolveWooDays(options);
  const stripeDays = resolveStripeDays(options);
  const qbPushDays = resolveQbPushDays(options, stripeDays);

  requireWooCommerceConfig();

  const orders = await syncWooCommerceOrders({
    days: wooDays,
    audit,
  });

  const products = await syncWooCommerceProductsFromApi({ audit });

  const stripe = await syncStripeBalanceTransactions({
    days: stripeDays,
    audit,
  });

  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    throw new Error(
      "QuickBooks is not connected — connect at /integrations/quickbooks before running the QuickBooks sync step",
    );
  }

  const pushDateFrom = calendarDateDaysAgo(qbPushDays);
  const { transactions: pushCandidates } = await listAllStripeBalanceTransactions({
    pushedToQuickbooks: "no",
    dateFrom: pushDateFrom,
  });
  const stripePush = await pushStripeBalanceTransactionsBulkToQuickBooks(
    pushCandidates,
  );

  const salesReceipts = await syncQuickBooksSalesReceipts(audit);
  const refundReceipts = await syncQuickBooksRefundReceipts(audit);

  return {
    woocommerce: { orders, products },
    stripe,
    quickbooks: { stripePush, salesReceipts, refundReceipts },
  };
}

/** WooCommerce → Stripe → push to QuickBooks → pull QuickBooks receipts. Each step must finish before the next starts. */
export async function runSyncIntegrationsCron(
  options: SyncIntegrationsCronOptions = {},
): Promise<SyncIntegrationsCronResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "integrations_sequential_sync",
      triggeredBy: audit.triggeredBy,
      userId: audit.userId,
      options: {
        wooDays: resolveWooDays(options),
        stripeDays: resolveStripeDays(options),
        qbPushDays: resolveQbPushDays(options, resolveStripeDays(options)),
      },
    },
    () => syncIntegrationsCronInner(options),
  );
}
