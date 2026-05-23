import { and, count, desc, eq, gte, lt, max, notExists, sql } from "drizzle-orm";
import { getDb } from "~/db";
import {
  quickbooksSalesReceipts,
  stripeBalanceTransactions,
} from "~/db/schema";
import type { QuickBooksMasterDataSyncResult } from "./quickbooks-master-data.server";
import {
  extractLineItemsFromQbSalesReceipt,
  type QuickBooksSalesReceiptLineItem,
} from "./quickbooks-sales-receipt-parse";
import { queryQuickBooksAll } from "./quickbooks-query.server";
import {
  runIntegrationJob,
  type IntegrationAuditContext,
} from "./integration-jobs.server";
import { getQuickBooksTokens } from "./quickbooks-tokens.server";

export const QUICKBOOKS_SALES_RECEIPTS_PAGE_SIZE = 50;

/** Only fetch sales receipts with TxnDate within this many days (rolling). */
export const QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS = 30;

type QbLine = {
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string };
    ItemAccountRef?: { value?: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
};

type QbAddr = {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
};

type QbSalesReceiptRow = {
  Id?: string;
  SyncToken?: string;
  DocNumber?: string;
  TxnDate?: string;
  TrackingNum?: string;
  TotalAmt?: number;
  CurrencyRef?: { value?: string; name?: string };
  CustomerRef?: { value?: string; name?: string };
  CustomerMemo?: { value?: string };
  BillEmail?: { Address?: string };
  ShipAddr?: QbAddr;
  ClassRef?: { value?: string; name?: string };
  DepartmentRef?: { value?: string; name?: string };
  PaymentMethodRef?: { value?: string; name?: string };
  DepositToAccountRef?: { value?: string; name?: string };
  PrivateNote?: string;
  TxnTaxDetail?: { TotalTax?: number };
  MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
  Line?: QbLine[];
};

export type QuickBooksSalesReceiptQbStatus = "active" | "deleted_in_qb";

export type QbSalesReceiptPresenceFilter = "active" | "deleted_in_qb" | "all";

export type QuickBooksSalesReceiptSyncResult = QuickBooksMasterDataSyncResult & {
  daysLimit: number;
  sinceDate: string;
  tombstoned: number;
};

export type QuickBooksSalesReceiptRecord = {
  id: string;
  realmId: string;
  quickbooksId: string;
  docNumber: string | null;
  txnDate: string | null;
  trackingNum: string | null;
  customerQuickbooksId: string | null;
  customerName: string | null;
  customerMemo: string | null;
  billEmail: string | null;
  shipAddrSummary: string | null;
  classRefId: string | null;
  classRefName: string | null;
  departmentRefId: string | null;
  departmentRefName: string | null;
  totalAmt: string;
  totalTax: string | null;
  currencyCode: string | null;
  currencyName: string | null;
  paymentMethod: string | null;
  depositToAccountRef: string | null;
  privateNote: string | null;
  syncToken: string | null;
  qbCreatedAt: string | null;
  qbUpdatedAt: string | null;
  lineCount: number | null;
  lineSummary: string | null;
  lineItems: QuickBooksSalesReceiptLineItem[];
  quickbooksRaw: Record<string, unknown> | null;
  qbStatus: QuickBooksSalesReceiptQbStatus;
  lastSeenAt: string | null;
  deletedInQbAt: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function parseQbSalesReceiptPresenceFilter(
  value: string | null,
): QbSalesReceiptPresenceFilter {
  if (value === "deleted_in_qb" || value === "all") return value;
  return "active";
}

function parseTxnDate(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return null;
}

function parseQbTimestamp(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShipAddr(addr: QbAddr | undefined): string | null {
  if (!addr) return null;
  const parts = [
    addr.Line1,
    addr.Line2,
    addr.City,
    addr.CountrySubDivisionCode,
    addr.PostalCode,
    addr.Country,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function salesReceiptSyncSinceDate(days = QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS): string {
  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  return since.toISOString().slice(0, 10);
}

function salesReceiptSyncQuery(days = QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS): string {
  const since = salesReceiptSyncSinceDate(days);
  return salesReceiptSyncQuerySince(since);
}

function salesReceiptSyncQuerySince(since: string): string {
  return `select * from SalesReceipt where TxnDate >= '${since}' orderby TxnDate desc`;
}

function countLineItems(lines: QbLine[] | undefined): number {
  if (!lines?.length) return 0;
  return lines.filter(
    (l) =>
      l.DetailType !== "SubTotalLineDetail" &&
      l.DetailType !== "DiscountLineDetail",
  ).length;
}

function summarizeLines(lines: QuickBooksSalesReceiptLineItem[]): string | null {
  if (!lines.length) return null;

  const parts: string[] = [];
  for (const line of lines) {
    const label =
      line.description ||
      line.itemRefName ||
      line.detailType ||
      "Line";
    const amt = line.amount ? ` (${line.amount})` : "";
    parts.push(`${label}${amt}`);
    if (parts.length >= 4) break;
  }

  if (parts.length === 0) return null;
  const extra =
    lines.length > parts.length ? ` (+${lines.length - parts.length} more)` : "";
  return parts.join("; ") + extra;
}

function rowToRecord(
  row: typeof quickbooksSalesReceipts.$inferSelect,
): QuickBooksSalesReceiptRecord {
  const lineItems =
    (row.lineItems as QuickBooksSalesReceiptLineItem[] | null) ?? [];

  return {
    id: row.id,
    realmId: row.realmId,
    quickbooksId: row.quickbooksId,
    docNumber: row.docNumber,
    txnDate: row.txnDate ?? null,
    trackingNum: row.trackingNum,
    customerQuickbooksId: row.customerQuickbooksId,
    customerName: row.customerName,
    customerMemo: row.customerMemo,
    billEmail: row.billEmail,
    shipAddrSummary: row.shipAddrSummary,
    classRefId: row.classRefId,
    classRefName: row.classRefName,
    departmentRefId: row.departmentRefId,
    departmentRefName: row.departmentRefName,
    totalAmt: row.totalAmt,
    totalTax: row.totalTax,
    currencyCode: row.currencyCode,
    currencyName: row.currencyName,
    paymentMethod: row.paymentMethod,
    depositToAccountRef: row.depositToAccountRef,
    privateNote: row.privateNote,
    syncToken: row.syncToken,
    qbCreatedAt: row.qbCreatedAt?.toISOString() ?? null,
    qbUpdatedAt: row.qbUpdatedAt?.toISOString() ?? null,
    lineCount: row.lineCount,
    lineSummary: row.lineSummary,
    lineItems,
    quickbooksRaw: row.quickbooksRaw ?? null,
    qbStatus: (row.qbStatus as QuickBooksSalesReceiptQbStatus) ?? "active",
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    deletedInQbAt: row.deletedInQbAt?.toISOString() ?? null,
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapQbRowToValues(realmId: string, row: QbSalesReceiptRow, syncedAt: Date) {
  const quickbooksId = row.Id?.trim();
  const raw = row as Record<string, unknown>;
  const lineItems = extractLineItemsFromQbSalesReceipt(raw);
  const totalAmt =
    row.TotalAmt !== undefined && row.TotalAmt !== null
      ? String(row.TotalAmt)
      : "0";
  const totalTax =
    row.TxnTaxDetail?.TotalTax !== undefined &&
    row.TxnTaxDetail?.TotalTax !== null
      ? String(row.TxnTaxDetail.TotalTax)
      : null;

  return {
    realmId,
    quickbooksId: quickbooksId!,
    docNumber: row.DocNumber?.trim() || null,
    txnDate: parseTxnDate(row.TxnDate),
    trackingNum: row.TrackingNum?.trim() || null,
    customerQuickbooksId: row.CustomerRef?.value ?? null,
    customerName: row.CustomerRef?.name ?? null,
    customerMemo: row.CustomerMemo?.value?.trim() || null,
    billEmail: row.BillEmail?.Address?.trim() || null,
    shipAddrSummary: formatShipAddr(row.ShipAddr),
    classRefId: row.ClassRef?.value ?? null,
    classRefName: row.ClassRef?.name ?? null,
    departmentRefId: row.DepartmentRef?.value ?? null,
    departmentRefName: row.DepartmentRef?.name ?? null,
    totalAmt,
    totalTax,
    currencyCode: row.CurrencyRef?.value ?? null,
    currencyName: row.CurrencyRef?.name ?? null,
    paymentMethod: row.PaymentMethodRef?.name ?? row.PaymentMethodRef?.value ?? null,
    depositToAccountRef:
      row.DepositToAccountRef?.name ?? row.DepositToAccountRef?.value ?? null,
    privateNote: row.PrivateNote?.trim() || null,
    syncToken: row.SyncToken?.trim() || null,
    qbCreatedAt: parseQbTimestamp(row.MetaData?.CreateTime),
    qbUpdatedAt: parseQbTimestamp(row.MetaData?.LastUpdatedTime),
    lineCount: countLineItems(row.Line),
    lineSummary: summarizeLines(lineItems),
    lineItems,
    quickbooksRaw: raw,
    qbStatus: "active" as const,
    lastSeenAt: syncedAt,
    deletedInQbAt: null,
    syncedAt,
    updatedAt: syncedAt,
  };
}

function buildListWhere(
  realmId: string,
  presence: QbSalesReceiptPresenceFilter,
) {
  const parts = [eq(quickbooksSalesReceipts.realmId, realmId)];
  if (presence === "active") {
    parts.push(eq(quickbooksSalesReceipts.qbStatus, "active"));
  } else if (presence === "deleted_in_qb") {
    parts.push(eq(quickbooksSalesReceipts.qbStatus, "deleted_in_qb"));
  }
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

async function resolveRealmId(): Promise<string> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    throw new Error("QuickBooks is not connected. Connect at /integrations/quickbooks first.");
  }
  return tokens.realmId;
}

/**
 * Upsert sales receipts by (realm_id, quickbooks_id): update if exists, insert if new.
 * Only fetches TxnDate within the last QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS days from QuickBooks.
 */
async function syncQuickBooksSalesReceiptsInner(options?: {
  sinceDate?: string;
}): Promise<QuickBooksSalesReceiptSyncResult> {
  const realmId = await resolveRealmId();
  const sinceDate = options?.sinceDate ?? salesReceiptSyncSinceDate();
  const daysLimit = options?.sinceDate
    ? Math.max(
        1,
        Math.ceil(
          (Date.now() - new Date(`${sinceDate}T00:00:00Z`).getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS;
  const rows = await queryQuickBooksAll<QbSalesReceiptRow>(
    salesReceiptSyncQuerySince(sinceDate),
    "SalesReceipt",
  );
  const db = getDb();
  const syncStartedAt = new Date();
  const syncedAt = syncStartedAt;
  let created = 0;
  let updated = 0;

  const seenQuickbooksIds = new Set<string>();

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    if (!quickbooksId || seenQuickbooksIds.has(quickbooksId)) continue;
    seenQuickbooksIds.add(quickbooksId);

    const values = mapQbRowToValues(realmId, row, syncedAt);
    const { realmId: _realm, quickbooksId: _qbId, ...updateSet } = values;

    const [upserted] = await db
      .insert(quickbooksSalesReceipts)
      .values({
        ...values,
        createdAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: [
          quickbooksSalesReceipts.realmId,
          quickbooksSalesReceipts.quickbooksId,
        ],
        set: updateSet,
      })
      .returning({
        inserted: sql<boolean>`(xmax = 0)`.as("inserted"),
      });

    if (upserted?.inserted) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const tombstonedRows = await db
    .update(quickbooksSalesReceipts)
    .set({
      qbStatus: "deleted_in_qb",
      deletedInQbAt: syncedAt,
      updatedAt: syncedAt,
    })
    .where(
      and(
        eq(quickbooksSalesReceipts.realmId, realmId),
        eq(quickbooksSalesReceipts.qbStatus, "active"),
        gte(quickbooksSalesReceipts.txnDate, sinceDate),
        lt(quickbooksSalesReceipts.lastSeenAt, syncStartedAt),
      ),
    )
    .returning({ id: quickbooksSalesReceipts.id });

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
    daysLimit,
    sinceDate,
    tombstoned: tombstonedRows.length,
  };
}

export async function syncQuickBooksSalesReceipts(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksSalesReceiptSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_sales_receipts_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
      options: { daysLimit: QUICKBOOKS_SALES_RECEIPT_SYNC_DAYS },
    },
    () => syncQuickBooksSalesReceiptsInner(),
  );
}

/** Sync sales receipts with TxnDate on or after `sinceDate` (YYYY-MM-DD). */
export async function syncQuickBooksSalesReceiptsSince(
  sinceDate: string,
  audit?: IntegrationAuditContext,
): Promise<QuickBooksSalesReceiptSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_sales_receipts_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
      options: { sinceDate },
    },
    () => syncQuickBooksSalesReceiptsInner({ sinceDate }),
  );
}

/** Remove synced receipts with no Stripe row pointing at their QuickBooks Id. */
export async function deleteQuickBooksSalesReceiptsWithoutStripeLink(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(quickbooksSalesReceipts)
    .where(
      notExists(
        db
          .select({ id: stripeBalanceTransactions.id })
          .from(stripeBalanceTransactions)
          .where(
            eq(
              stripeBalanceTransactions.quickbooksSalesReceiptId,
              quickbooksSalesReceipts.quickbooksId,
            ),
          ),
      ),
    )
    .returning({ id: quickbooksSalesReceipts.id });
  return deleted.length;
}

export async function countQuickBooksSalesReceiptsWithoutStripeLink(): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(quickbooksSalesReceipts)
    .where(
      notExists(
        db
          .select({ id: stripeBalanceTransactions.id })
          .from(stripeBalanceTransactions)
          .where(
            eq(
              stripeBalanceTransactions.quickbooksSalesReceiptId,
              quickbooksSalesReceipts.quickbooksId,
            ),
          ),
      ),
    );
  return value;
}

export type ListQuickBooksSalesReceiptsOptions = {
  page?: number;
  pageSize?: number;
  /** Default active — hides receipts removed in QuickBooks. */
  presence?: QbSalesReceiptPresenceFilter;
};

export type ListQuickBooksSalesReceiptsResult = {
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  presence: QbSalesReceiptPresenceFilter;
  receipts: QuickBooksSalesReceiptRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listQuickBooksSalesReceipts(
  options: ListQuickBooksSalesReceiptsOptions = {},
): Promise<ListQuickBooksSalesReceiptsResult> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const pageSize = options.pageSize ?? QUICKBOOKS_SALES_RECEIPTS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const presence = options.presence ?? "active";
  const db = getDb();

  if (!realmId) {
    return {
      connected: false,
      realmId: null,
      companyName: null,
      lastSyncedAt: null,
      presence,
      receipts: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  const where = buildListWhere(realmId, presence);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(quickbooksSalesReceipts)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select()
    .from(quickbooksSalesReceipts)
    .where(where)
    .orderBy(
      desc(quickbooksSalesReceipts.txnDate),
      desc(quickbooksSalesReceipts.docNumber),
    )
    .limit(pageSize)
    .offset(offset);

  const [syncRow] = await db
    .select({ value: max(quickbooksSalesReceipts.syncedAt) })
    .from(quickbooksSalesReceipts)
    .where(eq(quickbooksSalesReceipts.realmId, realmId));

  return {
    connected: true,
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: syncRow?.value?.toISOString() ?? null,
    presence,
    receipts: rows.map(rowToRecord),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function countQuickBooksSalesReceipts(): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(quickbooksSalesReceipts);
  return value;
}

export async function deleteAllQuickBooksSalesReceipts(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(quickbooksSalesReceipts)
    .returning({ id: quickbooksSalesReceipts.id });
  return deleted.length;
}

export async function getQuickBooksSalesReceiptById(
  id: string,
): Promise<QuickBooksSalesReceiptRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(quickbooksSalesReceipts)
    .where(eq(quickbooksSalesReceipts.id, id))
    .limit(1);

  return row ? rowToRecord(row) : null;
}

/** Lookup synced receipt by QuickBooks entity `Id` (optionally scoped to realm). */
/** Import a Sales Receipt returned from the QuickBooks create API into Lotus. */
export async function upsertQuickBooksSalesReceiptFromApi(
  salesReceipt: QbSalesReceiptRow | Record<string, unknown>,
): Promise<QuickBooksSalesReceiptRecord> {
  const realmId = await resolveRealmId();
  const quickbooksId = (salesReceipt as QbSalesReceiptRow).Id?.trim();
  if (!quickbooksId) {
    throw new Error("QuickBooks sales receipt response missing Id");
  }

  const db = getDb();
  const syncedAt = new Date();
  const values = mapQbRowToValues(
    realmId,
    salesReceipt as QbSalesReceiptRow,
    syncedAt,
  );
  const { realmId: _realm, quickbooksId: _qbId, ...updateSet } = values;

  const [row] = await db
    .insert(quickbooksSalesReceipts)
    .values({
      ...values,
      createdAt: syncedAt,
    })
    .onConflictDoUpdate({
      target: [
        quickbooksSalesReceipts.realmId,
        quickbooksSalesReceipts.quickbooksId,
      ],
      set: updateSet,
    })
    .returning();

  return rowToRecord(row!);
}

export async function getQuickBooksSalesReceiptByQuickbooksId(
  quickbooksId: string,
  realmId?: string,
): Promise<QuickBooksSalesReceiptRecord | null> {
  const db = getDb();
  const where = realmId
    ? and(
        eq(quickbooksSalesReceipts.realmId, realmId),
        eq(quickbooksSalesReceipts.quickbooksId, quickbooksId),
      )
    : eq(quickbooksSalesReceipts.quickbooksId, quickbooksId);
  const [row] = await db
    .select()
    .from(quickbooksSalesReceipts)
    .where(where)
    .limit(1);

  return row ? rowToRecord(row) : null;
}
