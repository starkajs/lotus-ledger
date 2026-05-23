import { and, asc, eq, max } from "drizzle-orm";
import { getDb } from "~/db";
import {
  quickbooksAccounts,
  quickbooksClasses,
  quickbooksItems,
  quickbooksPaymentMethods,
  quickbooksTaxCodes,
} from "~/db/schema";
import {
  extractClassRefFromItemRaw,
  extractSalesTaxCodeRefFromItemRaw,
  quickbooksRefName,
} from "~/lib/quickbooks-tax-code";
import {
  runIntegrationJob,
  type IntegrationAuditContext,
} from "./integration-jobs.server";
import { getQuickBooksTokens } from "./quickbooks-tokens.server";
import { queryQuickBooksAll } from "./quickbooks-query.server";

export type QuickBooksMasterDataSyncResult = {
  created: number;
  updated: number;
  total: number;
  syncedAt: string;
};

type QbAccountRow = {
  Id?: string;
  Name?: string;
  AcctNum?: string;
  AccountType?: string;
  AccountSubType?: string;
  FullyQualifiedName?: string;
  Active?: boolean;
};

type QbClassRow = {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  ParentRef?: { value?: string };
  Active?: boolean;
};

type QbItemRow = {
  Id?: string;
  Name?: string;
  Type?: string;
  Sku?: string;
  Description?: string;
  UnitPrice?: number;
  Active?: boolean;
  IncomeAccountRef?: { value?: string; name?: string };
  SalesTaxCodeRef?: { value?: string; name?: string };
  PurchaseTaxCodeRef?: { value?: string; name?: string };
};

type QbTaxCodeRow = {
  Id?: string;
  Name?: string;
  Description?: string;
  Active?: boolean;
  Taxable?: boolean;
};

type QbPaymentMethodRow = {
  Id?: string;
  Name?: string;
  Type?: string;
  Active?: boolean;
};

export type QuickBooksPaymentMethodRecord = {
  id: string;
  quickbooksId: string;
  name: string;
  type: string | null;
  active: boolean;
  syncedAt: string;
};

export type QuickBooksAccountRecord = {
  id: string;
  quickbooksId: string;
  name: string;
  accountNumber: string | null;
  accountType: string | null;
  accountSubType: string | null;
  fullyQualifiedName: string | null;
  active: boolean;
  syncedAt: string;
};

export type QuickBooksClassRecord = {
  id: string;
  quickbooksId: string;
  name: string;
  fullyQualifiedName: string | null;
  parentQuickbooksId: string | null;
  active: boolean;
  syncedAt: string;
};

export type QuickBooksItemRecord = {
  id: string;
  quickbooksId: string;
  name: string;
  itemType: string;
  sku: string | null;
  description: string | null;
  unitPrice: string | null;
  incomeAccountRef: string | null;
  quickbooksClassRef: string | null;
  salesTaxCodeRef: string | null;
  active: boolean;
  syncedAt: string;
};

export type QuickBooksItemPushDefaults = {
  quickbooksId: string;
  name: string;
  incomeAccountRef: string | null;
  quickbooksClassRef: string | null;
  quickbooksClassName: string | null;
  salesTaxCodeRef: string | null;
};

export type QuickBooksTaxCodeRecord = {
  id: string;
  quickbooksId: string;
  name: string;
  description: string | null;
  active: boolean;
  taxable: boolean | null;
  syncedAt: string;
};

async function resolveRealmId(): Promise<string> {
  const tokens = await getQuickBooksTokens();
  if (!tokens) {
    throw new Error("QuickBooks is not connected. Connect at /integrations/quickbooks first.");
  }
  return tokens.realmId;
}

async function upsertByQuickBooksId<T extends { quickbooksId: string }>(options: {
  realmId: string;
  quickbooksId: string;
  syncedAt: Date;
  buildInsert: () => Record<string, unknown>;
  buildUpdate: () => Record<string, unknown>;
  findExisting: () => Promise<{ id: string } | undefined>;
  insert: (values: Record<string, unknown>) => Promise<void>;
  update: (id: string, values: Record<string, unknown>) => Promise<void>;
}): Promise<"created" | "updated"> {
  const existing = await options.findExisting();
  const updateFields = {
    ...options.buildUpdate(),
    syncedAt: options.syncedAt,
    updatedAt: options.syncedAt,
  };

  if (existing) {
    await options.update(existing.id, updateFields);
    return "updated";
  }

  await options.insert({
    realmId: options.realmId,
    quickbooksId: options.quickbooksId,
    ...options.buildInsert(),
    syncedAt: options.syncedAt,
    createdAt: options.syncedAt,
    updatedAt: options.syncedAt,
  });
  return "created";
}

async function syncQuickBooksAccountsInner(): Promise<QuickBooksMasterDataSyncResult> {
  const realmId = await resolveRealmId();
  const rows = await queryQuickBooksAll<QbAccountRow>(
    "select * from Account",
    "Account",
  );
  const db = getDb();
  const syncedAt = new Date();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    const name = row.Name?.trim();
    if (!quickbooksId || !name) continue;

    const result = await upsertByQuickBooksId({
      realmId,
      quickbooksId,
      syncedAt,
      buildInsert: () => ({
        name,
        accountNumber: row.AcctNum?.trim() || null,
        accountType: row.AccountType ?? null,
        accountSubType: row.AccountSubType ?? null,
        fullyQualifiedName: row.FullyQualifiedName ?? null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      buildUpdate: () => ({
        name,
        accountNumber: row.AcctNum?.trim() || null,
        accountType: row.AccountType ?? null,
        accountSubType: row.AccountSubType ?? null,
        fullyQualifiedName: row.FullyQualifiedName ?? null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      findExisting: async () => {
        const [existing] = await db
          .select({ id: quickbooksAccounts.id })
          .from(quickbooksAccounts)
          .where(
            and(
              eq(quickbooksAccounts.realmId, realmId),
              eq(quickbooksAccounts.quickbooksId, quickbooksId),
            ),
          )
          .limit(1);
        return existing;
      },
      insert: async (values) => {
        await db.insert(quickbooksAccounts).values(values as typeof quickbooksAccounts.$inferInsert);
      },
      update: async (id, values) => {
        await db
          .update(quickbooksAccounts)
          .set(values as Partial<typeof quickbooksAccounts.$inferInsert>)
          .where(eq(quickbooksAccounts.id, id));
      },
    });

    if (result === "created") created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
  };
}

export async function syncQuickBooksAccounts(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksMasterDataSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_accounts_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
    },
    () => syncQuickBooksAccountsInner(),
  );
}

async function syncQuickBooksClassesInner(): Promise<QuickBooksMasterDataSyncResult> {
  const realmId = await resolveRealmId();
  const rows = await queryQuickBooksAll<QbClassRow>("select * from Class", "Class");
  const db = getDb();
  const syncedAt = new Date();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    const name = row.Name?.trim();
    if (!quickbooksId || !name) continue;

    const result = await upsertByQuickBooksId({
      realmId,
      quickbooksId,
      syncedAt,
      buildInsert: () => ({
        name,
        fullyQualifiedName: row.FullyQualifiedName ?? null,
        parentQuickbooksId: row.ParentRef?.value ?? null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      buildUpdate: () => ({
        name,
        fullyQualifiedName: row.FullyQualifiedName ?? null,
        parentQuickbooksId: row.ParentRef?.value ?? null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      findExisting: async () => {
        const [existing] = await db
          .select({ id: quickbooksClasses.id })
          .from(quickbooksClasses)
          .where(
            and(
              eq(quickbooksClasses.realmId, realmId),
              eq(quickbooksClasses.quickbooksId, quickbooksId),
            ),
          )
          .limit(1);
        return existing;
      },
      insert: async (values) => {
        await db.insert(quickbooksClasses).values(values as typeof quickbooksClasses.$inferInsert);
      },
      update: async (id, values) => {
        await db
          .update(quickbooksClasses)
          .set(values as Partial<typeof quickbooksClasses.$inferInsert>)
          .where(eq(quickbooksClasses.id, id));
      },
    });

    if (result === "created") created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
  };
}

export async function syncQuickBooksClasses(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksMasterDataSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_classes_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
    },
    () => syncQuickBooksClassesInner(),
  );
}

async function syncQuickBooksItemsInner(): Promise<QuickBooksMasterDataSyncResult> {
  const realmId = await resolveRealmId();
  const rows = await queryQuickBooksAll<QbItemRow>(
    "select * from Item where Type in ('Service', 'NonInventory', 'Inventory')",
    "Item",
  );
  const db = getDb();
  const syncedAt = new Date();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    const name = row.Name?.trim();
    const itemType = row.Type?.trim();
    if (!quickbooksId || !name || !itemType) continue;

    const unitPrice =
      row.UnitPrice !== undefined && row.UnitPrice !== null
        ? String(row.UnitPrice)
        : null;
    const itemRaw = row as Record<string, unknown>;
    const salesTaxCodeRef = extractSalesTaxCodeRefFromItemRaw(itemRaw);
    const quickbooksClassRef = extractClassRefFromItemRaw(itemRaw);

    const result = await upsertByQuickBooksId({
      realmId,
      quickbooksId,
      syncedAt,
      buildInsert: () => ({
        name,
        itemType,
        sku: row.Sku?.trim() || null,
        description: row.Description?.trim() || null,
        unitPrice,
        incomeAccountRef: row.IncomeAccountRef?.value ?? null,
        salesTaxCodeRef,
        active: row.Active !== false,
        quickbooksRaw: itemRaw,
      }),
      buildUpdate: () => ({
        name,
        itemType,
        sku: row.Sku?.trim() || null,
        description: row.Description?.trim() || null,
        unitPrice,
        incomeAccountRef: row.IncomeAccountRef?.value ?? null,
        salesTaxCodeRef,
        active: row.Active !== false,
        quickbooksRaw: itemRaw,
      }),
      findExisting: async () => {
        const [existing] = await db
          .select({ id: quickbooksItems.id })
          .from(quickbooksItems)
          .where(
            and(
              eq(quickbooksItems.realmId, realmId),
              eq(quickbooksItems.quickbooksId, quickbooksId),
            ),
          )
          .limit(1);
        return existing;
      },
      insert: async (values) => {
        await db.insert(quickbooksItems).values(values as typeof quickbooksItems.$inferInsert);
      },
      update: async (id, values) => {
        await db
          .update(quickbooksItems)
          .set(values as Partial<typeof quickbooksItems.$inferInsert>)
          .where(eq(quickbooksItems.id, id));
      },
    });

    if (result === "created") created += 1;
    else updated += 1;
  }

  await syncQuickBooksTaxCodesInner();
  await syncQuickBooksPaymentMethodsInner();

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
  };
}

async function syncQuickBooksPaymentMethodsInner(): Promise<QuickBooksMasterDataSyncResult> {
  const realmId = await resolveRealmId();
  const rows = await queryQuickBooksAll<QbPaymentMethodRow>(
    "select * from PaymentMethod",
    "PaymentMethod",
  );
  const db = getDb();
  const syncedAt = new Date();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    const name = row.Name?.trim();
    if (!quickbooksId || !name) continue;

    const result = await upsertByQuickBooksId({
      realmId,
      quickbooksId,
      syncedAt,
      buildInsert: () => ({
        name,
        type: row.Type?.trim() || null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      buildUpdate: () => ({
        name,
        type: row.Type?.trim() || null,
        active: row.Active !== false,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      findExisting: async () => {
        const [existing] = await db
          .select({ id: quickbooksPaymentMethods.id })
          .from(quickbooksPaymentMethods)
          .where(
            and(
              eq(quickbooksPaymentMethods.realmId, realmId),
              eq(quickbooksPaymentMethods.quickbooksId, quickbooksId),
            ),
          )
          .limit(1);
        return existing;
      },
      insert: async (values) => {
        await db
          .insert(quickbooksPaymentMethods)
          .values(values as typeof quickbooksPaymentMethods.$inferInsert);
      },
      update: async (id, values) => {
        await db
          .update(quickbooksPaymentMethods)
          .set(values as Partial<typeof quickbooksPaymentMethods.$inferInsert>)
          .where(eq(quickbooksPaymentMethods.id, id));
      },
    });

    if (result === "created") created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
  };
}

export async function syncQuickBooksPaymentMethods(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksMasterDataSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_payment_methods_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
    },
    () => syncQuickBooksPaymentMethodsInner(),
  );
}

async function syncQuickBooksTaxCodesInner(): Promise<QuickBooksMasterDataSyncResult> {
  const realmId = await resolveRealmId();
  const rows = await queryQuickBooksAll<QbTaxCodeRow>(
    "select * from TaxCode",
    "TaxCode",
  );
  const db = getDb();
  const syncedAt = new Date();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const quickbooksId = row.Id?.trim();
    const name = row.Name?.trim();
    if (!quickbooksId || !name) continue;

    const result = await upsertByQuickBooksId({
      realmId,
      quickbooksId,
      syncedAt,
      buildInsert: () => ({
        name,
        description: row.Description?.trim() || null,
        active: row.Active !== false,
        taxable: row.Taxable ?? null,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      buildUpdate: () => ({
        name,
        description: row.Description?.trim() || null,
        active: row.Active !== false,
        taxable: row.Taxable ?? null,
        quickbooksRaw: row as Record<string, unknown>,
      }),
      findExisting: async () => {
        const [existing] = await db
          .select({ id: quickbooksTaxCodes.id })
          .from(quickbooksTaxCodes)
          .where(
            and(
              eq(quickbooksTaxCodes.realmId, realmId),
              eq(quickbooksTaxCodes.quickbooksId, quickbooksId),
            ),
          )
          .limit(1);
        return existing;
      },
      insert: async (values) => {
        await db
          .insert(quickbooksTaxCodes)
          .values(values as typeof quickbooksTaxCodes.$inferInsert);
      },
      update: async (id, values) => {
        await db
          .update(quickbooksTaxCodes)
          .set(values as Partial<typeof quickbooksTaxCodes.$inferInsert>)
          .where(eq(quickbooksTaxCodes.id, id));
      },
    });

    if (result === "created") created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    total: rows.length,
    syncedAt: syncedAt.toISOString(),
  };
}

export async function syncQuickBooksTaxCodes(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksMasterDataSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_tax_codes_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
    },
    () => syncQuickBooksTaxCodesInner(),
  );
}

export async function syncQuickBooksItems(
  audit?: IntegrationAuditContext,
): Promise<QuickBooksMasterDataSyncResult> {
  const ctx = audit ?? { triggeredBy: "cli" as const };
  return runIntegrationJob(
    {
      jobType: "quickbooks_items_sync",
      triggeredBy: ctx.triggeredBy,
      userId: ctx.userId,
    },
    () => syncQuickBooksItemsInner(),
  );
}

async function latestSyncedAt(
  table:
    | typeof quickbooksAccounts
    | typeof quickbooksClasses
    | typeof quickbooksItems
    | typeof quickbooksTaxCodes
    | typeof quickbooksPaymentMethods,
  realmId: string | null,
): Promise<string | null> {
  if (!realmId) return null;
  const db = getDb();
  const [row] = await db
    .select({ value: max(table.syncedAt) })
    .from(table)
    .where(eq(table.realmId, realmId));
  return row?.value?.toISOString() ?? null;
}

export async function listQuickBooksAccounts(): Promise<{
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  accounts: QuickBooksAccountRecord[];
}> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const db = getDb();

  const accounts = realmId
    ? await db
        .select()
        .from(quickbooksAccounts)
        .where(eq(quickbooksAccounts.realmId, realmId))
        .orderBy(asc(quickbooksAccounts.fullyQualifiedName), asc(quickbooksAccounts.name))
    : [];

  return {
    connected: Boolean(tokens),
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: await latestSyncedAt(quickbooksAccounts, realmId),
    accounts: accounts.map((row) => ({
      id: row.id,
      quickbooksId: row.quickbooksId,
      name: row.name,
      accountNumber: row.accountNumber,
      accountType: row.accountType,
      accountSubType: row.accountSubType,
      fullyQualifiedName: row.fullyQualifiedName,
      active: row.active,
      syncedAt: row.syncedAt.toISOString(),
    })),
  };
}

export async function listQuickBooksClasses(): Promise<{
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  classes: QuickBooksClassRecord[];
}> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const db = getDb();

  const classes = realmId
    ? await db
        .select()
        .from(quickbooksClasses)
        .where(eq(quickbooksClasses.realmId, realmId))
        .orderBy(asc(quickbooksClasses.fullyQualifiedName), asc(quickbooksClasses.name))
    : [];

  return {
    connected: Boolean(tokens),
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: await latestSyncedAt(quickbooksClasses, realmId),
    classes: classes.map((row) => ({
      id: row.id,
      quickbooksId: row.quickbooksId,
      name: row.name,
      fullyQualifiedName: row.fullyQualifiedName,
      parentQuickbooksId: row.parentQuickbooksId,
      active: row.active,
      syncedAt: row.syncedAt.toISOString(),
    })),
  };
}

export async function listQuickBooksItems(): Promise<{
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  items: QuickBooksItemRecord[];
}> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const db = getDb();

  const items = realmId
    ? await db
        .select()
        .from(quickbooksItems)
        .where(eq(quickbooksItems.realmId, realmId))
        .orderBy(asc(quickbooksItems.name))
    : [];

  return {
    connected: Boolean(tokens),
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: await latestSyncedAt(quickbooksItems, realmId),
    items: items.map((row) => ({
      id: row.id,
      quickbooksId: row.quickbooksId,
      name: row.name,
      itemType: row.itemType,
      sku: row.sku,
      description: row.description,
      unitPrice: row.unitPrice,
      incomeAccountRef: row.incomeAccountRef,
      quickbooksClassRef: row.quickbooksClassRef,
      salesTaxCodeRef: row.salesTaxCodeRef,
      active: row.active,
      syncedAt: row.syncedAt.toISOString(),
    })),
  };
}

export async function getQuickBooksItemPushDefaults(
  quickbooksItemId: string | null | undefined,
): Promise<QuickBooksItemPushDefaults | null> {
  if (!quickbooksItemId?.trim()) return null;
  const tokens = await getQuickBooksTokens();
  if (!tokens) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(quickbooksItems)
    .where(
      and(
        eq(quickbooksItems.realmId, tokens.realmId),
        eq(quickbooksItems.quickbooksId, quickbooksItemId.trim()),
      ),
    )
    .limit(1);

  if (!row) return null;
  const raw = row.quickbooksRaw ?? null;
  return {
    quickbooksId: row.quickbooksId,
    name: row.name,
    incomeAccountRef: row.incomeAccountRef,
    quickbooksClassRef:
      row.quickbooksClassRef ?? extractClassRefFromItemRaw(raw),
    quickbooksClassName: raw ? quickbooksRefName(raw.ClassRef) : null,
    salesTaxCodeRef:
      row.salesTaxCodeRef ?? extractSalesTaxCodeRefFromItemRaw(raw),
  };
}

/** @deprecated Use getQuickBooksItemPushDefaults */
export async function getQuickBooksSalesTaxCodeRefForItem(
  quickbooksItemId: string | null | undefined,
): Promise<string | null> {
  const item = await getQuickBooksItemPushDefaults(quickbooksItemId);
  return item?.salesTaxCodeRef ?? null;
}

export async function listQuickBooksTaxCodes(): Promise<{
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  taxCodes: QuickBooksTaxCodeRecord[];
}> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const db = getDb();

  const taxCodes = realmId
    ? await db
        .select()
        .from(quickbooksTaxCodes)
        .where(eq(quickbooksTaxCodes.realmId, realmId))
        .orderBy(asc(quickbooksTaxCodes.name))
    : [];

  return {
    connected: Boolean(tokens),
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: await latestSyncedAt(quickbooksTaxCodes, realmId),
    taxCodes: taxCodes.map((row) => ({
      id: row.id,
      quickbooksId: row.quickbooksId,
      name: row.name,
      description: row.description,
      active: row.active,
      taxable: row.taxable,
      syncedAt: row.syncedAt.toISOString(),
    })),
  };
}

export async function listQuickBooksPaymentMethods(): Promise<{
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  lastSyncedAt: string | null;
  paymentMethods: QuickBooksPaymentMethodRecord[];
}> {
  const tokens = await getQuickBooksTokens();
  const realmId = tokens?.realmId ?? null;
  const db = getDb();

  const paymentMethods = realmId
    ? await db
        .select()
        .from(quickbooksPaymentMethods)
        .where(eq(quickbooksPaymentMethods.realmId, realmId))
        .orderBy(asc(quickbooksPaymentMethods.name))
    : [];

  return {
    connected: Boolean(tokens),
    realmId,
    companyName: tokens?.companyName ?? null,
    lastSyncedAt: await latestSyncedAt(quickbooksPaymentMethods, realmId),
    paymentMethods: paymentMethods.map((row) => ({
      id: row.id,
      quickbooksId: row.quickbooksId,
      name: row.name,
      type: row.type,
      active: row.active,
      syncedAt: row.syncedAt.toISOString(),
    })),
  };
}
