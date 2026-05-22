/** Client-safe Sales Receipt line parsing and stored line item shape. */

export type QuickBooksSalesReceiptLineItem = {
  lineNumber: number;
  detailType: string | null;
  description: string | null;
  amount: string | null;
  itemRefId: string | null;
  itemRefName: string | null;
  itemAccountRefId: string | null;
  itemAccountRefName: string | null;
  qty: string | null;
  unitPrice: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function refName(ref: unknown): string | null {
  const r = asRecord(ref);
  if (!r) return null;
  const name = r.name;
  return typeof name === "string" ? name.trim() || null : null;
}

function refId(ref: unknown): string | null {
  const r = asRecord(ref);
  if (!r) return null;
  const value = r.value;
  return typeof value === "string" ? value.trim() || null : null;
}

function parseLineFromRecord(line: Record<string, unknown>): QuickBooksSalesReceiptLineItem | null {
  const detailType =
    typeof line.DetailType === "string" ? line.DetailType : null;
  if (detailType === "SubTotalLineDetail" || detailType === "DiscountLineDetail") {
    return null;
  }

  const salesDetail = asRecord(line.SalesItemLineDetail);
  const amount =
    typeof line.Amount === "number"
      ? String(line.Amount)
      : typeof line.Amount === "string"
        ? line.Amount
        : null;

  return {
    lineNumber: 0,
    detailType,
    description:
      typeof line.Description === "string" ? line.Description.trim() || null : null,
    amount,
    itemRefId: salesDetail ? refId(salesDetail.ItemRef) : null,
    itemRefName: salesDetail ? refName(salesDetail.ItemRef) : null,
    itemAccountRefId: salesDetail ? refId(salesDetail.ItemAccountRef) : null,
    itemAccountRefName: salesDetail ? refName(salesDetail.ItemAccountRef) : null,
    qty:
      salesDetail && salesDetail.Qty !== undefined
        ? String(salesDetail.Qty)
        : null,
    unitPrice:
      salesDetail && salesDetail.UnitPrice !== undefined
        ? String(salesDetail.UnitPrice)
        : null,
  };
}

/** Parse SalesItemLineDetail lines from a synced Sales Receipt object. */
export function extractLineItemsFromQbSalesReceipt(
  raw: Record<string, unknown> | null | undefined,
): QuickBooksSalesReceiptLineItem[] {
  if (!raw) return [];
  const lines = raw.Line;
  if (!Array.isArray(lines)) return [];

  const parsed: QuickBooksSalesReceiptLineItem[] = [];

  for (const entry of lines) {
    const line = asRecord(entry);
    if (!line) continue;
    const item = parseLineFromRecord(line);
    if (!item) continue;
    parsed.push({ ...item, lineNumber: parsed.length + 1 });
  }

  return parsed;
}

/** Prefer structured line_items from DB; fall back to raw JSON. */
export function resolveQuickBooksSalesReceiptLines(input: {
  lineItems?: QuickBooksSalesReceiptLineItem[] | null;
  quickbooksRaw?: Record<string, unknown> | null;
}): QuickBooksSalesReceiptLineItem[] {
  if (input.lineItems?.length) {
    return input.lineItems;
  }
  return extractLineItemsFromQbSalesReceipt(input.quickbooksRaw);
}
