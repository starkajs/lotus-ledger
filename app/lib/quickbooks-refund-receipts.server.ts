import { and, count, desc, eq, gte, lt, max, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { quickbooksRefundReceipts } from "~/db/schema";
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

export const QUICKBOOKS_REFUND_RECEIPTS_PAGE_SIZE = 50;

/** Only fetch refund receipts with TxnDate within this many days (rolling). */
export const QUICKBOOKS_REFUND_RECEIPT_SYNC_DAYS = 30;

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

export type QbRefundReceiptRow = {
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

export type QuickBooksRefundReceiptQbStatus = "active" | "deleted_in_qb";

export type QbRefundReceiptPresenceFilter = "active" | "deleted_in_qb" | "all";

export type QuickBooksRefundReceiptSyncResult = QuickBooksMasterDataSyncResult & {
  daysLimit: number;
  sinceDate: string;
  tombstoned: number;
};

export type QuickBooksRefundReceiptRecord = {
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
  qbStatus: QuickBooksRefundReceiptQbStatus;
  lastSeenAt: string | null;
  deletedInQbAt: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function parseQbRefundReceiptPresenceFilter(
  value: string | null,
): QbRefundReceiptPresenceFilter {
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

function refundReceiptSyncSinceDate(
  days = QUICKBOOKS_REFUND_RECEIPT_SYNC_DAYS,
): string {
  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  return since.toISOString().slice(0, 10);
}

function refundReceiptSyncQuerySince(since: string): string {
  return `select * from RefundReceipt where TxnDate >= '${since}' orderby TxnDate desc`;
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
  row: typeof quickbooksRefundReceipts.$inferSelect,
): QuickBooksRefundReceiptRecord {
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
    qbStatus: (row.qbStatus as QuickBooksRefundReceiptQbStatus) ?? "active",
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    deletedInQbAt: row.deletedInQbAt?.toISOString() ?? null,
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapQbRowToValues(
  realmId: string,
  row: QbRefundReceiptRow,
  syncedAt: Date,
) {
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
    paymentMethod:
      row.PaymentMethodRef?.name ?? row.PaymentMethodRef?.value ?? null,
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
  presence: QbRefundReceiptPresenceFilter,
) {
  const parts = [eq(quickbooksRefundReceipts.realmId, realmId)];
  if (presence === "active") {
    parts.push(eq(quickbooksRefundReceipts.qbStatus, "active"));
  } else if (presence === "deleted_in_qb") {
    parts.push(eq(quickbooksRefundReceipts.qbStatus, "deleted_in_qb"));
  }
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

async function resolveRealmId(): Promise<string> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    throw new Error(
      "QuickBooks is not connected. Connect at /integrations/quickbooks first.",
    );
  }
  return tokens.realmId;
}

async function syncQuickBooksRefundReceiptsInner(options?: {
  sinceDate?: string;
}): Promise<QuickBooksRefundReceiptSyncResult> {
  const realmId = await resolveRealmId();
  const sinceDate = options?.sinceDate ?? refundReceiptSyncSinceDate();
  const daysLimit = options?.sinceDate
    ? Math.max(
        1,
        Math.ceil(
          (Date.now() - new Date(`${sinceDate}T00:00:00Z`).getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : QUICKBOOKS_REFUND_RECEIPT_SYNC_DAYS;
  const rows = await queryQuickBooksAll<QbRefundReceiptRow>(
    refundReceiptSyncQuerySince(sinceDate),
    "RefundReceipt",
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
      .insert(quickbooksRefundReceipts)
      .values({
        ...values,
        createdAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: [
          quickbooksRefundReceipts.realmId,
          quickbooksRefundReceipts.quickbooksId,
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
    .update(quickbooksRefundReceipts)
    .set({
      qbStatus: "deleted_in_qb",
      deletedInQbAt: syncedAt,
      updatedAt: syncedAt,
    })
    .where(
      and(
        eq(quickbooksRefundReceipts.realmId, realmId),
        eq(quickbooksRefundReceipts.qbStatus, "active"),
        gte(quickbooksRefundReceipts.txnDate, sinceDate),
        lt(quickbooksRefundReceipts.lastSeenAt, syncStartedAt),
      ),
    )
    .returning({ id: quickbooksRefundReceipts.id });

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

export async function syncQuickBooksRefundReceipts(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksRefundReceiptSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_refund_receipts_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
      options: { daysLimit: QUICKBOOKS_REFUND_RECEIPT_SYNC_DAYS },
    },
    () => syncQuickBooksRefundReceiptsInner(),
  );
}

export async function syncQuickBooksRefundReceiptsSince(
  sinceDate: string,
  audit?: IntegrationAuditContext,
): Promise<QuickBooksRefundReceiptSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_refund_receipts_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
      options: { sinceDate },
    },
    () => syncQuickBooksRefundReceiptsInner({ sinceDate }),
  );
}

export type ListQuickBooksRefundReceiptsOptions = {
  page?: number;
  pageSize?: number;
  presence?: QbRefundReceiptPresenceFilter;
};

export type ListQuickBooksRefundReceiptsResult = {
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  presence: QbRefundReceiptPresenceFilter;
  receipts: QuickBooksRefundReceiptRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listQuickBooksRefundReceipts(
  options: ListQuickBooksRefundReceiptsOptions = {},
): Promise<ListQuickBooksRefundReceiptsResult> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const pageSize = options.pageSize ?? QUICKBOOKS_REFUND_RECEIPTS_PAGE_SIZE;
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
    .from(quickbooksRefundReceipts)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select()
    .from(quickbooksRefundReceipts)
    .where(where)
    .orderBy(
      desc(quickbooksRefundReceipts.txnDate),
      desc(quickbooksRefundReceipts.docNumber),
    )
    .limit(pageSize)
    .offset(offset);

  const [syncRow] = await db
    .select({ value: max(quickbooksRefundReceipts.syncedAt) })
    .from(quickbooksRefundReceipts)
    .where(eq(quickbooksRefundReceipts.realmId, realmId));

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

export async function getQuickBooksRefundReceiptById(
  id: string,
): Promise<QuickBooksRefundReceiptRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(quickbooksRefundReceipts)
    .where(eq(quickbooksRefundReceipts.id, id))
    .limit(1);

  return row ? rowToRecord(row) : null;
}

export async function upsertQuickBooksRefundReceiptFromApi(
  refundReceipt: QbRefundReceiptRow | Record<string, unknown>,
): Promise<QuickBooksRefundReceiptRecord> {
  const realmId = await resolveRealmId();
  const quickbooksId = (refundReceipt as QbRefundReceiptRow).Id?.trim();
  if (!quickbooksId) {
    throw new Error("QuickBooks refund receipt response missing Id");
  }

  const db = getDb();
  const syncedAt = new Date();
  const values = mapQbRowToValues(
    realmId,
    refundReceipt as QbRefundReceiptRow,
    syncedAt,
  );
  const { realmId: _realm, quickbooksId: _qbId, ...updateSet } = values;

  const [row] = await db
    .insert(quickbooksRefundReceipts)
    .values({
      ...values,
      createdAt: syncedAt,
    })
    .onConflictDoUpdate({
      target: [
        quickbooksRefundReceipts.realmId,
        quickbooksRefundReceipts.quickbooksId,
      ],
      set: updateSet,
    })
    .returning();

  return rowToRecord(row!);
}

export async function getQuickBooksRefundReceiptByQuickbooksId(
  quickbooksId: string,
  realmId?: string,
): Promise<QuickBooksRefundReceiptRecord | null> {
  const db = getDb();
  const where = realmId
    ? and(
        eq(quickbooksRefundReceipts.realmId, realmId),
        eq(quickbooksRefundReceipts.quickbooksId, quickbooksId),
      )
    : eq(quickbooksRefundReceipts.quickbooksId, quickbooksId);
  const [row] = await db
    .select()
    .from(quickbooksRefundReceipts)
    .where(where)
    .limit(1);

  return row ? rowToRecord(row) : null;
}
