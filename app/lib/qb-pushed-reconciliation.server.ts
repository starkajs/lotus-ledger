import { and, eq, gte, inArray, lte, or, type SQL } from "drizzle-orm";
import { getDb } from "~/db";
import {
  products,
  quickbooksRefundReceipts,
  quickbooksSalesReceipts,
  stripeBalanceTransactions,
} from "~/db/schema";
import {
  calendarDateCreatedGte,
  calendarDateCreatedLte,
  calendarDateFromInstant,
  type IsoDateString,
} from "~/lib/date-range-filters";
import {
  classifyQbPushedReconciliation,
  type QbPushedDocumentKind,
  type QbPushedReceipt,
  type QbPushedReconciliation,
  type QbPushedStripe,
} from "~/lib/qb-pushed-reconciliation";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";

export type { QbPushedReconciliation };

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function orParts(parts: Array<SQL | undefined>): SQL | undefined {
  const present = parts.filter((part): part is SQL => part != null);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return or(...present);
}

function stripeDateWhere(dateFrom: IsoDateString, dateTo: IsoDateString) {
  return and(
    calendarDateCreatedGte(stripeBalanceTransactions.stripeCreatedAt, dateFrom),
    calendarDateCreatedLte(stripeBalanceTransactions.stripeCreatedAt, dateTo),
  );
}

type ReceiptRow = {
  id: string;
  quickbooksId: string;
  docNumber: string | null;
  txnDate: string | null;
  trackingNum: string | null;
  customerName: string | null;
  totalAmt: string;
  totalTax: string | null;
  currencyCode: string | null;
};

function mapReceipt(row: ReceiptRow, kind: QbPushedDocumentKind): QbPushedReceipt {
  return { ...row, kind };
}

async function loadSalesReceipts(where: SQL | undefined): Promise<QbPushedReceipt[]> {
  if (!where) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: quickbooksSalesReceipts.id,
      quickbooksId: quickbooksSalesReceipts.quickbooksId,
      docNumber: quickbooksSalesReceipts.docNumber,
      txnDate: quickbooksSalesReceipts.txnDate,
      trackingNum: quickbooksSalesReceipts.trackingNum,
      customerName: quickbooksSalesReceipts.customerName,
      totalAmt: quickbooksSalesReceipts.totalAmt,
      totalTax: quickbooksSalesReceipts.totalTax,
      currencyCode: quickbooksSalesReceipts.currencyCode,
    })
    .from(quickbooksSalesReceipts)
    .where(where);
  return rows.map((row) => mapReceipt(row, "sales"));
}

async function loadRefundReceipts(where: SQL | undefined): Promise<QbPushedReceipt[]> {
  if (!where) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: quickbooksRefundReceipts.id,
      quickbooksId: quickbooksRefundReceipts.quickbooksId,
      docNumber: quickbooksRefundReceipts.docNumber,
      txnDate: quickbooksRefundReceipts.txnDate,
      trackingNum: quickbooksRefundReceipts.trackingNum,
      customerName: quickbooksRefundReceipts.customerName,
      totalAmt: quickbooksRefundReceipts.totalAmt,
      totalTax: quickbooksRefundReceipts.totalTax,
      currencyCode: quickbooksRefundReceipts.currencyCode,
    })
    .from(quickbooksRefundReceipts)
    .where(where);
  return rows.map((row) => mapReceipt(row, "refund"));
}

function receiptWhere(
  realmId: string,
  table:
    | typeof quickbooksSalesReceipts
    | typeof quickbooksRefundReceipts,
  dateFrom: IsoDateString,
  dateTo: IsoDateString,
) {
  return and(
    eq(table.realmId, realmId),
    eq(table.qbStatus, "active"),
    gte(table.txnDate, dateFrom),
    lte(table.txnDate, dateTo),
  );
}

function extraReceiptWhere(
  realmId: string,
  table:
    | typeof quickbooksSalesReceipts
    | typeof quickbooksRefundReceipts,
  quickbooksIds: string[],
  trackingNums: string[],
) {
  const match = orParts([
    quickbooksIds.length > 0 ? inArray(table.quickbooksId, quickbooksIds) : undefined,
    trackingNums.length > 0 ? inArray(table.trackingNum, trackingNums) : undefined,
  ]);
  if (!match) return undefined;
  return and(eq(table.realmId, realmId), eq(table.qbStatus, "active"), match);
}

async function loadPushedStripe(where: SQL | undefined): Promise<QbPushedStripe[]> {
  if (!where) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.id,
      stripeBalanceTransactionId: stripeBalanceTransactions.stripeBalanceTransactionId,
      stripePaymentIntentId: stripeBalanceTransactions.stripePaymentIntentId,
      stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      amount: stripeBalanceTransactions.amount,
      fee: stripeBalanceTransactions.fee,
      net: stripeBalanceTransactions.net,
      currency: stripeBalanceTransactions.currency,
      type: stripeBalanceTransactions.type,
      quickbooksSalesReceiptId: stripeBalanceTransactions.quickbooksSalesReceiptId,
      quickbooksRefundReceiptId: stripeBalanceTransactions.quickbooksRefundReceiptId,
      productCode: products.code,
      productName: products.name,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(products, eq(stripeBalanceTransactions.productId, products.id))
    .where(where);

  return rows.map((row) => ({
    id: row.id,
    stripeBalanceTransactionId: row.stripeBalanceTransactionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeDate: calendarDateFromInstant(row.stripeCreatedAt),
    amount: row.amount,
    fee: row.fee,
    net: row.net,
    currency: row.currency,
    type: row.type,
    quickbooksSalesReceiptId: row.quickbooksSalesReceiptId,
    quickbooksRefundReceiptId: row.quickbooksRefundReceiptId,
    productCode: row.productCode,
    productName: row.productName,
  }));
}

function mergeById<T extends { id: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()];
}

function trackingKeys(stripeRows: QbPushedStripe[]): string[] {
  return unique(
    stripeRows.flatMap((stripe) => [
      stripe.stripePaymentIntentId,
      stripe.stripeBalanceTransactionId,
    ]),
  );
}

export async function loadQbPushedReconciliation(input: {
  dateFrom: IsoDateString;
  dateTo: IsoDateString;
}): Promise<QbPushedReconciliation | null> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) return null;

  const { realmId } = tokens;
  const { dateFrom, dateTo } = input;

  const [pushedInPeriod, salesInPeriod, refundsInPeriod] = await Promise.all([
    loadPushedStripe(
      and(eq(stripeBalanceTransactions.pushedToQuickbooks, true), stripeDateWhere(dateFrom, dateTo)),
    ),
    loadSalesReceipts(receiptWhere(realmId, quickbooksSalesReceipts, dateFrom, dateTo)),
    loadRefundReceipts(receiptWhere(realmId, quickbooksRefundReceipts, dateFrom, dateTo)),
  ]);

  const pushedTrackings = trackingKeys(pushedInPeriod);
  const [extraSales, extraRefunds] = await Promise.all([
    loadSalesReceipts(
      extraReceiptWhere(
        realmId,
        quickbooksSalesReceipts,
        unique(pushedInPeriod.map((stripe) => stripe.quickbooksSalesReceiptId)),
        pushedTrackings,
      ),
    ),
    loadRefundReceipts(
      extraReceiptWhere(
        realmId,
        quickbooksRefundReceipts,
        unique(pushedInPeriod.map((stripe) => stripe.quickbooksRefundReceiptId)),
        pushedTrackings,
      ),
    ),
  ]);

  const sales = mergeById([...salesInPeriod, ...extraSales]);
  const refunds = mergeById([...refundsInPeriod, ...extraRefunds]);
  const inPeriodReceipts = [...salesInPeriod, ...refundsInPeriod];
  const knownStripeIds = new Set(pushedInPeriod.map((stripe) => stripe.id));

  const outsidePushed = (
    await loadPushedStripe(
      and(
        eq(stripeBalanceTransactions.pushedToQuickbooks, true),
        orParts([
          inPeriodReceipts.some((receipt) => receipt.kind === "sales")
            ? inArray(
                stripeBalanceTransactions.quickbooksSalesReceiptId,
                unique(
                  inPeriodReceipts
                    .filter((receipt) => receipt.kind === "sales")
                    .map((receipt) => receipt.quickbooksId),
                ),
              )
            : undefined,
          inPeriodReceipts.some((receipt) => receipt.kind === "refund")
            ? inArray(
                stripeBalanceTransactions.quickbooksRefundReceiptId,
                unique(
                  inPeriodReceipts
                    .filter((receipt) => receipt.kind === "refund")
                    .map((receipt) => receipt.quickbooksId),
                ),
              )
            : undefined,
          unique(inPeriodReceipts.map((receipt) => receipt.trackingNum)).length > 0
            ? or(
                inArray(
                  stripeBalanceTransactions.stripePaymentIntentId,
                  unique(inPeriodReceipts.map((receipt) => receipt.trackingNum)),
                ),
                inArray(
                  stripeBalanceTransactions.stripeBalanceTransactionId,
                  unique(inPeriodReceipts.map((receipt) => receipt.trackingNum)),
                ),
              )
            : undefined,
        ]),
      ),
    )
  ).filter((stripe) => !knownStripeIds.has(stripe.id));

  const outsideTrackings = trackingKeys(outsidePushed);
  const [outsideSales, outsideRefunds] = await Promise.all([
    loadSalesReceipts(
      extraReceiptWhere(
        realmId,
        quickbooksSalesReceipts,
        unique(outsidePushed.map((stripe) => stripe.quickbooksSalesReceiptId)),
        outsideTrackings,
      ),
    ),
    loadRefundReceipts(
      extraReceiptWhere(
        realmId,
        quickbooksRefundReceipts,
        unique(outsidePushed.map((stripe) => stripe.quickbooksRefundReceiptId)),
        outsideTrackings,
      ),
    ),
  ]);

  return classifyQbPushedReconciliation({
    dateFrom,
    dateTo,
    pushed: [...pushedInPeriod, ...outsidePushed],
    receipts: mergeById([...sales, ...refunds, ...outsideSales, ...outsideRefunds]),
  });
}
