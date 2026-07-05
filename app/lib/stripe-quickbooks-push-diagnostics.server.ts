import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { products, quickbooksItems } from "~/db/schema";
import { queryQuickBooksAll } from "~/lib/quickbooks-query.server";
import { getQuickBooksTokens } from "~/lib/quickbooks-tokens.server";
import type { StripeBalanceTransactionRecord } from "~/lib/stripe-balance-transactions.server";
import {
  planStripeQuickBooksPushForTransaction,
  type StripeQuickBooksPushPlan,
} from "~/lib/stripe-quickbooks-push-plan.server";

type QbItemLiveRow = {
  Id?: string;
  Name?: string;
  Active?: boolean;
  Type?: string;
};

export type StripeQuickBooksPushItemDiagnostics = {
  lotusProduct: {
    id: string;
    code: string;
    name: string;
    quickbooksItemId: string | null;
    quickbooksTaxCodeId: string | null;
    vatRatePercent: number;
  } | null;
  /** Row in Lotus `quickbooks_items` for the mapped QB Id + current realm. */
  syncedQuickBooksItem: {
    quickbooksId: string;
    name: string;
    active: boolean;
    itemType: string;
    incomeAccountRef: string | null;
    salesTaxCodeRef: string | null;
  } | null;
  /** Live query against the connected QuickBooks company (not the Lotus cache). */
  liveQuickBooksItem: {
    quickbooksId: string;
    name: string;
    active: boolean;
    itemType: string;
  } | null;
  itemRefValue: string | null;
  itemRefName: string | null;
  taxCodeRefValue: string | null;
  itemAccountRefValue: string | null;
  classRefValue: string | null;
  warnings: string[];
};

function isSafeQuickBooksId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

async function fetchLiveQuickBooksItem(
  quickbooksItemId: string,
): Promise<QbItemLiveRow | null> {
  if (!isSafeQuickBooksId(quickbooksItemId)) return null;
  const id = quickbooksItemId.trim();
  const rows = await queryQuickBooksAll<QbItemLiveRow>(
    `select * from Item where Id = '${id}'`,
    "Item",
  );
  return rows[0] ?? null;
}

export async function loadStripeQuickBooksPushItemDiagnostics(input: {
  transaction: Pick<
    StripeBalanceTransactionRecord,
    | "productId"
    | "productCode"
    | "productName"
    | "productQuickbooksItemId"
    | "productQuickbooksTaxCodeId"
    | "productVatRatePercent"
  >;
  plan: StripeQuickBooksPushPlan;
}): Promise<StripeQuickBooksPushItemDiagnostics> {
  const warnings: string[] = [];
  const tokens = await getQuickBooksTokens();
  const db = getDb();

  let lotusProduct: StripeQuickBooksPushItemDiagnostics["lotusProduct"] = null;
  if (input.transaction.productId) {
    const [row] = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        quickbooksItemId: products.quickbooksItemId,
        quickbooksTaxCodeId: products.quickbooksTaxCodeId,
        vatRatePercent: products.vatRatePercent,
      })
      .from(products)
      .where(eq(products.id, input.transaction.productId))
      .limit(1);
    if (row) {
      lotusProduct = {
        id: row.id,
        code: row.code,
        name: row.name,
        quickbooksItemId: row.quickbooksItemId,
        quickbooksTaxCodeId: row.quickbooksTaxCodeId,
        vatRatePercent: row.vatRatePercent,
      };
    }
  }

  const mappedId =
    lotusProduct?.quickbooksItemId?.trim() ||
    input.transaction.productQuickbooksItemId?.trim() ||
    null;

  let syncedQuickBooksItem: StripeQuickBooksPushItemDiagnostics["syncedQuickBooksItem"] =
    null;
  if (mappedId && tokens) {
    const [row] = await db
      .select({
        quickbooksId: quickbooksItems.quickbooksId,
        name: quickbooksItems.name,
        active: quickbooksItems.active,
        itemType: quickbooksItems.itemType,
        incomeAccountRef: quickbooksItems.incomeAccountRef,
        salesTaxCodeRef: quickbooksItems.salesTaxCodeRef,
      })
      .from(quickbooksItems)
      .where(
        and(
          eq(quickbooksItems.realmId, tokens.realmId),
          eq(quickbooksItems.quickbooksId, mappedId),
        ),
      )
      .limit(1);
    if (row) {
      syncedQuickBooksItem = row;
      if (!row.active) {
        warnings.push(
          "Synced QuickBooks item is marked inactive in Lotus — QuickBooks may reject it on create.",
        );
      }
    } else if (mappedId) {
      warnings.push(
        `No row in Lotus quickbooks_items for QB Id "${mappedId}" on realm ${tokens.realmId}. Refresh Products & services, then re-check /products QuickBooks item ID.`,
      );
    }
  }

  if (mappedId && !isSafeQuickBooksId(mappedId)) {
    warnings.push(
      `products.quickbooks_item_id is "${mappedId}" — QuickBooks ItemRef.value must be the numeric QuickBooks Id (e.g. 19), not the item name or Lotus uuid.`,
    );
  }

  let liveQuickBooksItem: StripeQuickBooksPushItemDiagnostics["liveQuickBooksItem"] =
    null;
  if (mappedId && tokens && isSafeQuickBooksId(mappedId)) {
    try {
      const live = await fetchLiveQuickBooksItem(mappedId);
      if (live?.Id) {
        liveQuickBooksItem = {
          quickbooksId: live.Id,
          name: live.Name?.trim() || live.Id,
          active: live.Active !== false,
          itemType: live.Type?.trim() || "—",
        };
        if (!liveQuickBooksItem.active) {
          warnings.push("Item is inactive in QuickBooks right now.");
        }
      } else {
        warnings.push(
          `QuickBooks live query returned no Item with Id "${mappedId}". The Id on /products may be stale, from another company, or from sandbox vs production.`,
        );
      }
    } catch (err) {
      warnings.push(
        `Could not verify item in QuickBooks: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const qbDocument =
    input.plan.documentKind === "refund_receipt"
      ? input.plan.refundReceipt
      : input.plan.salesReceipt;
  const lineDetail = qbDocument?.Line[0]?.SalesItemLineDetail;

  if (
    lotusProduct?.quickbooksItemId &&
    input.transaction.productQuickbooksItemId &&
    lotusProduct.quickbooksItemId !== input.transaction.productQuickbooksItemId
  ) {
    warnings.push(
      "Lotus product quickbooks_item_id differs from the value joined on this Stripe row — save the product again or re-classify.",
    );
  }

  return {
    lotusProduct,
    syncedQuickBooksItem,
    liveQuickBooksItem,
    itemRefValue: lineDetail?.ItemRef?.value ?? mappedId,
    itemRefName: lineDetail?.ItemRef?.name ?? syncedQuickBooksItem?.name ?? null,
    taxCodeRefValue: lineDetail?.TaxCodeRef?.value ?? input.plan.taxCodeId,
    itemAccountRefValue: lineDetail?.ItemAccountRef?.value ?? null,
    classRefValue: lineDetail?.ClassRef?.value ?? null,
    warnings,
  };
}

export async function loadStripeQuickBooksPushPreview(input: {
  transaction: StripeBalanceTransactionRecord;
}): Promise<{
  plan: StripeQuickBooksPushPlan;
  itemDiagnostics: StripeQuickBooksPushItemDiagnostics;
}> {
  const plan = await planStripeQuickBooksPushForTransaction({
    transaction: input.transaction,
  });
  const itemDiagnostics = await loadStripeQuickBooksPushItemDiagnostics({
    transaction: input.transaction,
    plan,
  });
  return { plan, itemDiagnostics };
}
